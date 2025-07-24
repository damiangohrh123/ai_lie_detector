import React, { useState } from 'react';
import FaceExpressionDetector from './components/FaceExpressionDetector';
import VoiceRecorder from './components/VoiceRecorder';
import FaceAnalysisBars from './components/FaceAnalysisBars';
import TextAnalysis from './components/TextAnalysis';
import './App.css';

export default function App() {
  const [faceEmotions, setFaceEmotions] = useState([]);
  const [voiceResults, setVoiceResults] = useState([]);
    // Aggregate transcript
    const transcript = voiceResults.slice(-3).map(r => r.text).join(' ');

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
          <VoiceRecorder setVoiceResults={setVoiceResults} />
        </section>
        <section className="section">
          <h2 className="section-label">Face Analysis</h2>
          <FaceAnalysisBars smoothedEmotions={faceEmotions} />
        </section>
        <section className="section">
          <h2 className="section-label">Text Analysis</h2>
          <TextAnalysis transcript={transcript} segments={voiceResults} />
        </section>
      </div>

      {/* Overall truthfulness section */}
      <div className="third-pane">

      </div>
    </div>
    
  );
}
