import React, { useState, useEffect, useRef } from 'react';
import FaceExpressionDetector from './components/FaceExpressionDetector';
import VoiceRecorder from './components/VoiceRecorder';
import FaceAnalysisBars from './components/FaceAnalysisBars';
import TextAnalysis from './components/TextAnalysis';
import FusionTruthfulness from './components/FusionTruthfulness';
import DeceptionTimeline from './components/DeceptionTimeline';
import FileUploader from './components/FileUploader';
import './App.css';

export default function App() {
  const [mode, setMode] = useState('webcam'); // 'webcam' or 'upload'
  const [faceEmotions, setFaceEmotions] = useState([]);
  const [voiceResults, setVoiceResults] = useState([]);
  const [transcriptHistory, setTranscriptHistory] = useState([]);
  const [deceptionTimeline, setDeceptionTimeline] = useState([]);
  const [fusionScore, setFusionScore] = useState(null);

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

  return (
    <div className="app-layout">
      <div className="first-pane">
        {/* Mode Selector */}
        <div className="mode-selector-container">
          <button
            onClick={() => setMode('webcam')}
            className="mode-button"
            style={{
              background: mode === 'webcam' ? 'white' : 'transparent',
              color: mode === 'webcam' ? '#374151' : '#6b7280',
              fontWeight: mode === 'webcam' ? 600 : 500,
              boxShadow: mode === 'webcam' ? '0 1px 3px 0 rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            📹 Webcam Mode
          </button>
          <button
            onClick={() => setMode('upload')}
            className="mode-button"
            style={{
              background: mode === 'upload' ? 'white' : 'transparent',
              color: mode === 'upload' ? '#374151' : '#6b7280',
              fontWeight: mode === 'upload' ? 600 : 500,
              boxShadow: mode === 'upload' ? '0 1px 3px 0 rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            📁 File Upload Mode
          </button>

        </div>

        {/* Video and timeline analysis section */}
        {mode === 'webcam' ? (
          <>
            <FaceExpressionDetector onEmotionsUpdate={setFaceEmotions} />
            <FusionTruthfulness face={faceVec || [0, 0]} voice={voiceVec || [0, 0]} text={textVec || [0, 0]} setFusionScore={setFusionScore} />
          </>
        ) : (
          <FileUploader
            setVoiceResults={setVoiceResults}
            setTranscriptHistory={setTranscriptHistory}
            setFaceEmotions={setFaceEmotions}
          />
        )}
      </div>

      {/* Voice, face, and text analysis section */}
      <div className="second-pane">
        {mode === 'webcam' ? (
          <>
            <section className="voice-section">
              <h2 className="section-label">Voice Analysis</h2>
              <VoiceRecorder setVoiceResults={setVoiceResults} setTranscriptHistory={setTranscriptHistory} />
            </section>
            <section className="face-section">
              <h2 className="section-label">Face Analysis</h2>
              <FaceAnalysisBars smoothedEmotions={faceEmotions} />
            </section>
          </>
        ) : (
          <section className="upload-section">
            <h2 className="section-label">Upload Analysis</h2>
            <div style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', padding: '20px' }}>
              Upload a video file above to start analysis. Results will appear here once processing is complete.
            </div>
          </section>
        )}
        <DeceptionTimeline timeline={deceptionTimeline} />
      </div>

      {/* Overall truthfulness section */}
      <div className="third-pane">
        <TextAnalysis transcript={transcript} segments={transcriptHistory} />
      </div>
    </div>
  );
}
