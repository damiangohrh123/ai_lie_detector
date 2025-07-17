import React, { useState } from 'react';
import FaceExpressionDetector from './components/FaceExpressionDetector';
import VoiceRecorder from './components/VoiceRecorder';
import FaceAnalysisBars from './components/FaceAnalysisBars';
import './App.css';

export default function App() {
  const [faceEmotions, setFaceEmotions] = useState([]);

  return (
    <div className="app-layout">
      <div className="first-pane">
        <FaceExpressionDetector onEmotionsUpdate={setFaceEmotions} />
      </div>

      <div className="second-pane">
        <section className="section">
          <h2 className="section-label">Voice Analysis</h2>
          <VoiceRecorder />
        </section>
        <section className="section">
          <h2 className="section-label">Face Analysis</h2>
          <FaceAnalysisBars smoothedEmotions={faceEmotions} />
        </section>
        <section className="section">
          <h2 className="section-label">Text Analysis</h2>
        </section>
      </div>
      <div className="third-pane">

      </div>
    </div>
    
  );
}
