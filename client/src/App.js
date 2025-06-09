import React from 'react';
import FaceExpressionDetector from './components/FaceExpressionDetector';
import VoiceEmotionAnalyzer from './components/VoiceEmotionAnalyzer';
import './App.css';

function App() {
  return (
    <div className="App">
      <FaceExpressionDetector />
      <VoiceEmotionAnalyzer />
    </div>
  );
}

export default App;