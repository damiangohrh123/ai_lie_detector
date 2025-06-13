import React, { useState } from 'react';
import FaceExpressionDetector from './components/FaceExpressionDetector';
import VoiceRecorder from './components/VoiceRecorder';
import FaceAnalysisBars from './components/FaceAnalysisBars';
import './App.css';

export default function App() {
  const [faceEmotions, setFaceEmotions] = useState([]);

  return (
    <div className="app-layout">
      <div className="left-pane">
        <FaceExpressionDetector onEmotionsUpdate={setFaceEmotions} />
      </div>

      <div className="right-pane">
        <section className="section">
          <h2>Voice Analysis</h2>
          <VoiceRecorder />
        </section>
        <section className="section">
          <h2>Face Analysis</h2>
          <FaceAnalysisBars smoothedEmotions={faceEmotions} />
        </section>
        <section className="section">
          <h2>Text Analysis</h2>
        </section>
      </div>
    </div>
  );
}
