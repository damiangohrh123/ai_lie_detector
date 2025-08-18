import React from 'react';

const emotionColors = {
  neutral: '#9E9E9E',
  happy: '#FFD700',
  sad: '#2196F3',
  angry: '#F44336',
  disgusted: '#8BC34A',
  fearful: '#673AB7',
};

const emotionFullNames = {
  neutral: "Neutral",
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
  disgusted: "Disgust",
  fearful: "Fear",
};

export default function FaceAnalysisBars({ currentEmotions }) {
  return (
    <div className="face-analysis-container">
      {['neutral', 'happy', 'sad', 'angry', 'disgusted', 'fearful'].map((emotion) => {
        const match = currentEmotions.find((e) => e.emotion === emotion);
        const probability = match ? match.probability : 0;
        return (
          <div key={emotion} className="face-analysis-bars">
            <span className="face-analysis-bars-label">{emotionFullNames[emotion]}</span>
            <div className="face-analysis-bar-background">
              <div style={{
                width: `${probability}%`,
                height: '100%',
                background: emotionColors[emotion] || '#007bff',
                borderRadius: 4,
                transition: 'width 0.4s'
              }} />
            </div>
            <span style={{ width: 50, textAlign: 'right', fontSize: '0.95em', color: '#666', fontWeight: '500' }}>{probability.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}
