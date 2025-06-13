import React from 'react';
import FaceExpressionDetector from './components/FaceExpressionDetector';
import VoiceRecorder from './components/VoiceRecorder';
import './App.css';

function App() {
  return (
    <div className="app-layout">
      <div className="left-pane">
        <FaceExpressionDetector />
      </div>
      <div className="right-pane">
        <section className="section facial-analysis">
          <h2>Facial Analysis</h2>
        </section>
        <section className="section voice-analysis">
          <h2>Voice Analysis</h2>
          <VoiceRecorder />
        </section>
        <section className="section text-analysis">
          <h2>Text Analysis</h2>

          <div style={{padding: '10px', fontStyle: 'italic', color: '#555'}}>
            Text analysis will appear here.
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
