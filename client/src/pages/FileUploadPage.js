import React, { useState, useEffect, useRef } from 'react';
import FaceExpressionDetector from '../components/FaceExpressionDetector';
import AudioProcessor from '../components/AudioProcessor';
import FaceAnalysisBars from '../components/FaceAnalysisBars';
import SpeechPatternPanel from '../components/SpeechPatternPanel';
import FusionTruthfulness from '../components/FusionTruthfulness';
import DeceptionTimeline from '../components/DeceptionTimeline';
import FileUploader from '../components/FileUploader';
import { captureThumbnail, timelineToPNG, computeTopMoments, captureSnippetAtMs, computeAvgFusion } from '../utils/exportHelpers';

export default function FileUploadPage() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showUploadOverlay, setShowUploadOverlay] = useState(true);
  const [faceEmotions, setFaceEmotions] = useState([]);
  const [voiceResults, setVoiceResults] = useState([]);
  const [transcriptHistory, setTranscriptHistory] = useState([]);
  const [deceptionTimeline, setDeceptionTimeline] = useState([]);
  const [fusionScore, setFusionScore] = useState(null);
  const [videoRef, setVideoRef] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Get latest [truth, lie] for face modality
  let faceVec = undefined;
  if (faceEmotions && faceEmotions.length > 0) {
    const last = faceEmotions;

    // Truthful emotions: neutral, happy
    const truth = (last.find(e => e.emotion === 'neutral')?.probability || 0)
      + (last.find(e => e.emotion === 'happy')?.probability || 0);

    // Deceptive emotions: angry, sad, disgusted, fearful
    const lie = (last.find(e => e.emotion === 'angry')?.probability || 0)
      + (last.find(e => e.emotion === 'sad')?.probability || 0)
      + (last.find(e => e.emotion === 'disgusted')?.probability || 0)
      + (last.find(e => e.emotion === 'fearful')?.probability || 0);

    // Normalize to [0, 1]
    faceVec = [truth / 100, lie / 100];
  }

  // Get latest [truth, lie] for voice modality
  let voiceVec = undefined;
  if (voiceResults && voiceResults.length > 0) {
    // Find the most recent voice emotion result
    const lastVoice = [...voiceResults].reverse().find(r => r.emotion);
    if (lastVoice && lastVoice.emotion) {
      const v = lastVoice.emotion;

      // Truthful emotions: neutral, happy
      const truth = (v.neu || 0) + (v.hap || 0);

      // Deceptive emotions: angry, sad
      const lie = (v.ang || 0) + (v.sad || 0);

      voiceVec = [truth, lie];
    }
  }

  // Get latest [truth, lie] for text modality
  let textVec = undefined;
  if (voiceResults && voiceResults.length > 0) {
    const last = voiceResults[voiceResults.length - 1];
    if (last && last.label && typeof last.score === 'number') {
      if (last.label.toLowerCase() === 'truthful') {
        textVec = [last.score, 1 - last.score];
      } else if (last.label.toLowerCase() === 'deceptive') {
        textVec = [1 - last.score, last.score];
      }
    }
  }

  // Track the latest fusion score for the timeline
  useEffect(() => {
    // Listen for changes in the fusion score from FusionTruthfulness
    if (fusionScore !== null && fusionScore !== undefined) {
      setDeceptionTimeline(prev => {
        const next = [...prev, { time: Date.now(), score: fusionScore }];
        return next.slice(-60); // Keep last 60 points
      });
    }
  }, [fusionScore]);

  // Handle file upload completion
  const handleFileUploadComplete = (file) => {
    setUploadedFile(file);
    setShowUploadOverlay(false);
  };

  // Handle new file upload request
  const handleNewUpload = () => {
    setShowUploadOverlay(true);
    setUploadedFile(null);
    // Reset analysis data
    setFaceEmotions([]);
    setVoiceResults([]);
    setTranscriptHistory([]);
    setDeceptionTimeline([]);
    setFusionScore(null);
  };

  async function exportSession() {
    try {
      setExporting(true);

      const thumbnail = captureThumbnail(videoRef);
      const timeline_png = timelineToPNG(deceptionTimeline);
      let top_moments = computeTopMoments(deceptionTimeline, transcriptHistory, 5);

      // Capture a small snippet image for each top moment
      try {
        for (let i = 0; i < top_moments.length; i++) {
          const tm = top_moments[i];
          if (tm && tm.time_ms) {
            // eslint-disable-next-line no-await-in-loop
            tm.video_snippet = await captureSnippetAtMs(videoRef, tm.time_ms, deceptionTimeline);
          } else {
            tm.video_snippet = null;
          }
        }
      } catch (e) {
        console.warn('Failed to capture some top moment snippets', e);
      }

      // Compute average fusion score
      const avgFusion = computeAvgFusion(deceptionTimeline, fusionScore);

      const payload = {
        session_id: `upload-${Date.now()}`,
        timestamp: new Date().toISOString(),
        fusion_score: avgFusion,
        timeline: deceptionTimeline,
        transcript: transcriptHistory,
        top_moments: top_moments,
        // include uploaded file info if available
        video_name: uploadedFile?.name || uploadedFile?.fileName || null,
        thumbnail_url: thumbnail,
        timeline_png: timeline_png,
        video_url: null
      };

      const respPromise = fetch('http://localhost:8000/api/export-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resp = await respPromise;

      const contentType = resp.headers.get('content-type') || '';
      if (resp.ok && contentType.includes('application/pdf')) {
        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session_summary-${payload.session_id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        // Clear transient analysis data after successful export
        try { setTranscriptHistory([]); } catch (e) { }
        try { setVoiceResults([]); } catch (e) { }
        try { setFaceEmotions([]); } catch (e) { }
        try { setDeceptionTimeline([]); } catch (e) { }
        try { setFusionScore(null); } catch (e) { }

        // Also clear internal buffers in AudioProcessor
        try { if (window && window.__clearAudioTranscripts) { window.__clearAudioTranscripts(); } } catch (e) { }
      } else {
        let bodyText = await resp.text();
        try {
          const j = JSON.parse(bodyText);
          alert('Export failed: ' + (j.detail || j.error || JSON.stringify(j)));
        } catch (e) {
          alert('Export failed: ' + bodyText);
        }
      }
      return resp;
    } catch (e) {
      console.error('Export error', e);
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  }

  // Expose exporter to top-level navigation button via a stable wrapper so
  // the effect doesn't re-run every render (exportSession is recreated each render).
  const exportRef = useRef(null);
  exportRef.current = exportSession;
  useEffect(() => {
    window.__exportSession = (...args) => exportRef.current && exportRef.current(...args);
    return () => { delete window.__exportSession; };
  }, []);

  return (
    <div className="app-layout">
      <div className="first-pane">
        {/* Upload New File Button - only show after a file has been uploaded */}
        {uploadedFile && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleNewUpload}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500
                }}
              >
                📁 Upload New File
              </button>
            </div>
          </div>
        )}

        {/* Upload Overlay. Show by default, or by clicking "Upload New File" button */}
        {(showUploadOverlay || !uploadedFile) && (
          <FileUploader
            setVoiceResults={setVoiceResults}
            setTranscriptHistory={setTranscriptHistory}
            setFaceEmotions={setFaceEmotions}
            onUploadComplete={handleFileUploadComplete}
          />
        )}

        {/* Video area - only show when file is uploaded */}
        {uploadedFile && (
          <div style={{ position: 'relative' }}>
            <FaceExpressionDetector
              onEmotionsUpdate={setFaceEmotions}
              videoFile={uploadedFile}
              onVideoRef={setVideoRef}
            />
          </div>
        )}
      </div>

      {/* Voice and face analysis section */}
      <div className="second-pane">
        {uploadedFile ? (
          <>
            <section className="voice-section">
              <h2 className="section-label">👄 Voice Analysis</h2>
              <AudioProcessor
                mode="video"
                videoFile={uploadedFile}
                videoRef={videoRef}
                setVoiceResults={setVoiceResults}
                setTranscriptHistory={setTranscriptHistory}
              />
            </section>
            <section className="face-section">
              <h2 className="section-label">😀 Face Analysis</h2>
              <FaceAnalysisBars currentEmotions={faceEmotions} />
            </section>
          </>
        ) : (
          <>
            <section className="voice-section">
              <h2 className="section-label">👄 Voice Analysis</h2>
              <div className="upload-analysis-placeholder-text">
                Upload a video file to analyze voice patterns and emotions.
              </div>
            </section>
            <section className="face-section">
              <h2 className="section-label">😀 Face Analysis</h2>
              <div className="upload-analysis-placeholder-text">
                Upload a video file to analyze facial expressions and emotions.
              </div>
            </section>
          </>
        )}

        {/* Text Analysis section */}
        <section className="speech-pattern-section">
          <h2 className="section-label">💬 Speech Pattern Analysis</h2>
          <SpeechPatternPanel segments={transcriptHistory} />
        </section>
      </div>

      {/* Truthfulness Timeline */}
      <div className="third-pane">
        <h2 className="section-label">📈 Overall Truthfulness</h2>
        {uploadedFile ? (
          <>
            <div className="third-pane-content">
              <FusionTruthfulness face={faceVec || [0, 0]} voice={voiceVec || [0, 0]} text={textVec || [0, 0]} setFusionScore={setFusionScore} />
              <DeceptionTimeline timeline={deceptionTimeline} currentScore={fusionScore} />
            </div>
          </>
        ) : (
          <div className="upload-analysis-placeholder-text">
            Upload a video file to see truthfulness patterns over time.
          </div>
        )}
      </div>
    </div>
  );
}