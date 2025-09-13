import React, { useState, useEffect, useRef } from 'react';
import FaceExpressionDetector from '../components/FaceExpressionDetector';
import AudioProcessor from '../components/AudioProcessor';
import FaceAnalysisBars from '../components/FaceAnalysisBars';
import SpeechPatternPanel from '../components/SpeechPatternPanel';
import FusionTruthfulness from '../components/FusionTruthfulness';
import DeceptionTimeline from '../components/DeceptionTimeline';
import { captureThumbnail, timelineToPNG, computeTopMoments, captureSnippetAtMs, computeAvgFusion, capitalizeTranscription } from '../utils/exportHelpers';

export default function WebcamPage() {
  const [faceEmotions, setFaceEmotions] = useState([]);
  const [voiceResults, setVoiceResults] = useState([]);
  const [transcriptHistory, setTranscriptHistory] = useState([]);
  const [deceptionTimeline, setDeceptionTimeline] = useState([]);
  const [fusionScore, setFusionScore] = useState(null);
  const [videoRef, setVideoRef] = useState(null);
  const audioRef = useRef(null);

  // Use transcriptHistory for display
  const transcript = transcriptHistory.map(r => r.text).join(' ');

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
  const fusionScoreRef = useRef(null);
  useEffect(() => {
    // Listen for changes in the fusion score from FusionTruthfulness
    if (fusionScore !== null && fusionScore !== undefined) {
      setDeceptionTimeline(prev => {
        const next = [...prev, { time: Date.now(), score: fusionScore }];
        return next.slice(-60); // Keep last 60 points
      });
    }
  }, [fusionScore]);

  const [exporting, setExporting] = useState(false);

  async function exportSession() {
    try {
      setExporting(true);
      // Attempt to capture thumbnail and a small timeline image for the PDF
      const thumbnail = captureThumbnail(videoRef);
      const timeline_png = timelineToPNG(deceptionTimeline);
      let top_moments = computeTopMoments(deceptionTimeline, transcriptHistory, 5);
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

      // Build payload from current state
      const avgFusion = computeAvgFusion(deceptionTimeline, fusionScore);

      const payload = {
        session_id: `webcam-${Date.now()}`,
        timestamp: new Date().toISOString(),
        fusion_score: avgFusion,
        timeline: deceptionTimeline,
        transcript: transcriptHistory,
        transcript_capitalized: (transcriptHistory || []).map(s => ({ ...s, text: capitalizeTranscription(s.text) })),
        top_moments: top_moments,
        thumbnail_url: thumbnail,
        timeline_png: timeline_png,
        video_url: null
      };

      // DEBUG: log payload and relevant state
      try { console.debug('Export payload (webcam):', { payload, voiceResults, textVec, transcriptHistory }); } catch (e) { }

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
  try { audioRef.current?.clear(); } catch (e) { }
      } else {
        // Try to parse JSON error
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

  // Expose exporter to top-level navigation button
  useEffect(() => {
    window.__exportSession = exportSession;
    return () => { delete window.__exportSession; };
  }, [exportSession]);

  return (
    <div className="app-layout">
      <div className="first-pane">
        {/* Video area */}
        <div style={{ position: 'relative' }}>
          <FaceExpressionDetector onEmotionsUpdate={setFaceEmotions} onVideoRef={setVideoRef} />
        </div>
      </div>

      {/* Voice and face analysis section */}
      <div className="second-pane">
        <section className="voice-section">
          <h2 className="section-label">👄 Voice Analysis</h2>
          <AudioProcessor
            ref={audioRef}
            mode="live"
            setVoiceResults={setVoiceResults}
            setTranscriptHistory={setTranscriptHistory}
          />
        </section>
        <section className="face-section">
          <h2 className="section-label">😀 Face Analysis</h2>
          <FaceAnalysisBars currentEmotions={faceEmotions} />
        </section>

        {/* Speech Pattern Analysis */}
        <section className="speech-pattern-section">
          <h2 className="section-label">💬 Speech Pattern Analysis</h2>
          <SpeechPatternPanel segments={transcriptHistory} />
        </section>
      </div>

      {/* Truthfulness Timeline section */}
      <div className="third-pane">
        <h2 className="section-label">📈 Overall Truthfulness</h2>
        <div className="third-pane-content">
          <FusionTruthfulness face={faceVec || [0, 0]} voice={voiceVec || [0, 0]} text={textVec || [0, 0]} setFusionScore={setFusionScore} />
          <DeceptionTimeline timeline={deceptionTimeline} currentScore={fusionScore} />
        </div>
      </div>
    </div>
  );
} 