import React, { useState, useEffect, useRef } from 'react';
import FaceExpressionDetector from '../components/FaceExpressionDetector';
import AudioProcessor from '../components/AudioProcessor';
import FaceAnalysisBars from '../components/FaceAnalysisBars';
import SpeechPatternPanel from '../components/SpeechPatternPanel';
import FusionTruthfulness from '../components/FusionTruthfulness';
import DeceptionTimeline from '../components/DeceptionTimeline';
import FileUploader from '../components/FileUploader';
import { captureThumbnail, timelineToPNG, computeTopMoments, captureSnippetAtMs, computeAvgFusion, capitalizeTranscription } from '../utils/exportHelpers';

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
  const audioRef = useRef(null);

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
        // Add capitalized transcript segments
        transcript_capitalized: (transcriptHistory || []).map(s => ({ ...s, text: capitalizeTranscription(s.text) })),
        top_moments: top_moments,
        // include uploaded file info if available
        video_name: uploadedFile?.name || uploadedFile?.fileName || null,
        thumbnail_url: thumbnail,
        timeline_png: timeline_png,
        video_url: null
      };

  const API_BASE = (process.env.REACT_APP_API_BASE || 'http://localhost:8000').replace(/\/+$/, '');
  const respPromise = fetch(`${API_BASE}/api/export-summary`, {
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
  try { audioRef.current?.clear(); } catch (e) { }
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
              onPlaybackEnd={() => {
                try { audioRef.current && audioRef.current.stop && audioRef.current.stop(); } catch (e) {}
              }}
            />
          </div>
        )}
      </div>

      {/* Voice and face analysis section */}
      <div className="second-pane">
        {uploadedFile ? (
          <>
            <section className="voice-section">
              <h2 className="section-label"><span className="section-icon section-icon-voice" aria-hidden="true"> 
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" focusable="false" aria-hidden="true"><path d="M320 64C267 64 224 107 224 160L224 288C224 341 267 384 320 384C373 384 416 341 416 288L416 160C416 107 373 64 320 64zM176 248C176 234.7 165.3 224 152 224C138.7 224 128 234.7 128 248L128 288C128 385.9 201.3 466.7 296 478.5L296 528L248 528C234.7 528 224 538.7 224 552C224 565.3 234.7 576 248 576L392 576C405.3 576 416 565.3 416 552C416 538.7 405.3 528 392 528L344 528L344 478.5C438.7 466.7 512 385.9 512 288L512 248C512 234.7 501.3 224 488 224C474.7 224 464 234.7 464 248L464 288C464 367.5 399.5 432 320 432C240.5 432 176 367.5 176 288L176 248z" fill="currentColor"/></svg>
              </span>Voice Analysis</h2>
              <AudioProcessor
                ref={audioRef}
                mode="video"
                videoFile={uploadedFile}
                videoRef={videoRef}
                setVoiceResults={setVoiceResults}
                setTranscriptHistory={setTranscriptHistory}
              />
            </section>
            <section className="face-section">
              <h2 className="section-label"><span className="section-icon section-icon-face" aria-hidden="true"> 
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" focusable="false" aria-hidden="true"><path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM229.4 385.9C249.8 413.9 282.8 432 320 432C357.2 432 390.2 413.9 410.6 385.9C418.4 375.2 433.4 372.8 444.1 380.6C454.8 388.4 457.2 403.4 449.4 414.1C420.3 454 373.2 480 320 480C266.8 480 219.7 454 190.6 414.1C182.8 403.4 185.2 388.4 195.9 380.6C206.6 372.8 221.6 375.2 229.4 385.9zM208 272C208 254.3 222.3 240 240 240C257.7 240 272 254.3 272 272C272 289.7 257.7 304 240 304C222.3 304 208 289.7 208 272zM400 240C417.7 240 432 254.3 432 272C432 289.7 417.7 304 400 304C382.3 304 368 289.7 368 272C368 254.3 382.3 240 400 240z" fill="currentColor"/></svg>
              </span>Face Analysis</h2>
              <FaceAnalysisBars currentEmotions={faceEmotions} />
            </section>
          </>
        ) : (
          <>
            <section className="voice-section">
              <h2 className="section-label"><span className="section-icon section-icon-voice" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z" fill="currentColor"/><path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V21h-3a1 1 0 100 2h8a1 1 0 100-2h-3v-3.08A7 7 0 0019 11z" fill="currentColor" opacity="0.9"/></svg></span>Voice Analysis</h2>
              <div className="upload-analysis-placeholder-text">
                Upload a video file to analyze voice patterns and emotions.
              </div>
            </section>
            <section className="face-section">
              <h2 className="section-label"><span className="section-icon section-icon-face" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="none"/><path d="M8.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM15.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor"/><path d="M8 15c1.2-1 2.8-1 4 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg></span>Face Analysis</h2>
              <div className="upload-analysis-placeholder-text">
                Upload a video file to analyze facial expressions and emotions.
              </div>
            </section>
          </>
        )}

        {/* Text Analysis section */}
        <section className="speech-pattern-section">
          <h2 className="section-label"><span className="section-icon section-icon-speech" aria-hidden="true"> 
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" focusable="false" aria-hidden="true"><path d="M576 304C576 436.5 461.4 544 320 544C282.9 544 247.7 536.6 215.9 523.3L97.5 574.1C88.1 578.1 77.3 575.8 70.4 568.3C63.5 560.8 62 549.8 66.8 540.8L115.6 448.6C83.2 408.3 64 358.3 64 304C64 171.5 178.6 64 320 64C461.4 64 576 171.5 576 304z" fill="currentColor"/></svg>
          </span>Speech Pattern Analysis</h2>
          <SpeechPatternPanel segments={transcriptHistory} />
        </section>
      </div>

      {/* Truthfulness Timeline */}
  <div className="third-pane">
  <h2 className="section-label"><span className="section-icon section-icon-overall" aria-hidden="true"> 
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" focusable="false" aria-hidden="true"><path d="M128 128C128 110.3 113.7 96 96 96C78.3 96 64 110.3 64 128L64 464C64 508.2 99.8 544 144 544L544 544C561.7 544 576 529.7 576 512C576 494.3 561.7 480 544 480L144 480C135.2 480 128 472.8 128 464L128 128zM534.6 214.6C547.1 202.1 547.1 181.8 534.6 169.3C522.1 156.8 501.8 156.8 489.3 169.3L384 274.7L326.6 217.4C314.1 204.9 293.8 204.9 281.3 217.4L185.3 313.4C172.8 325.9 172.8 346.2 185.3 358.7C197.8 371.2 218.1 371.2 230.6 358.7L304 285.3L361.4 342.7C373.9 355.2 394.2 355.2 406.7 342.7L534.7 214.7z" fill="currentColor"/></svg>
  </span>Overall Truthfulness</h2>
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