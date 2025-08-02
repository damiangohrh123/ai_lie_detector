import React, { useState, useEffect, useRef } from 'react';
import FaceExpressionDetector from '../components/FaceExpressionDetector';
import AudioProcessor from '../components/AudioProcessor';
import FaceAnalysisBars from '../components/FaceAnalysisBars';
import TextAnalysis from '../components/TextAnalysis';
import FusionTruthfulness from '../components/FusionTruthfulness';
import DeceptionTimeline from '../components/DeceptionTimeline';

export default function WebcamPage() {
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
        {/* Video area */}
        <div style={{ position: 'relative' }}>
          <FaceExpressionDetector onEmotionsUpdate={setFaceEmotions} />
        </div>

        {/* Fusion Truthfulness Component */}
        <section className="fusion-section">
          <h2 className="section-label">✅ Truthfulness Fusion</h2>
          <FusionTruthfulness face={faceVec || [0, 0]} voice={voiceVec || [0, 0]} text={textVec || [0, 0]} setFusionScore={setFusionScore} />
        </section>
      </div>

      {/* Voice and face analysis section */}
      <div className="second-pane">
        <section className="voice-section">
          <h2 className="section-label">👄 Voice Analysis</h2>
          <AudioProcessor 
            mode="live"
            setVoiceResults={setVoiceResults} 
            setTranscriptHistory={setTranscriptHistory} 
          />
        </section>
        <section className="face-section">
          <h2 className="section-label">😀 Face Analysis</h2>
          <FaceAnalysisBars smoothedEmotions={faceEmotions} />
        </section>

        {/* Truthfulness Timeline */}
        <section className="deception-timeline-section">
          <h2 className="section-label">📈 Deception Timeline</h2>
          <DeceptionTimeline timeline={deceptionTimeline} />
        </section>
      </div>

      {/* Text Analysis section */}
      <div className="third-pane">
        <h2 className="section-label">💬 Speech Pattern Analysis</h2>
        <TextAnalysis transcript={transcript} segments={transcriptHistory} />
      </div>
    </div>
  );
} 