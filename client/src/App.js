import React from 'react';
import FaceExpressionDetector from './components/FaceExpressionDetector';
import VoiceRecorder from "./components/VoiceRecorder";
import './App.css';

function App() {
  return (
    <div className="App">
      <FaceExpressionDetector />
      <h1>AI Lie Detector</h1>
      <VoiceRecorder />
    </div>
  );
}

export default App;