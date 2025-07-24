import React, { useState } from 'react';
import FaceExpressionDetector from './components/FaceExpressionDetector';
import VoiceRecorder from './components/VoiceRecorder';
import FaceAnalysisBars from './components/FaceAnalysisBars';
import TextAnalysis from './components/TextAnalysis';
import FusionTruthfulness from './components/FusionTruthfulness';
import './App.css';

export default function App() {
  const [faceEmotions, setFaceEmotions] = useState([]);
  const [voiceResults, setVoiceResults] = useState([]);
  const [transcriptHistory, setTranscriptHistory] = useState([]);

  // Aggregate transcript
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

  return (
    <div className="app-layout">
      {/* Video and timeline analysis section */}
      <div className="first-pane">
        <FaceExpressionDetector onEmotionsUpdate={setFaceEmotions} />
      </div>

      {/* Voice, face, and text analysis section */}
      <div className="second-pane">
        <section className="section">
          <h2 className="section-label">Voice Analysis</h2>
          <VoiceRecorder setVoiceResults={setVoiceResults} setTranscriptHistory={setTranscriptHistory} />
        </section>
        <section className="section">
          <h2 className="section-label">Face Analysis</h2>
          <FaceAnalysisBars smoothedEmotions={faceEmotions} />
        </section>
        <section className="section">
          <h2 className="section-label">Text Analysis</h2>
          <TextAnalysis transcript={transcript} segments={transcriptHistory} />
        </section>
      </div>

      {/* Overall truthfulness section */}
      <div className="third-pane">
        <FusionTruthfulness face={faceVec || [0, 0]} voice={voiceVec || [0, 0]} text={textVec || [0, 0]} />
      </div>
    </div>
  );
}
