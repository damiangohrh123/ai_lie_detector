import React from 'react';

const emotionColors = {
  neutral: '#9E9E9E',
  happy: '#FFD700',
  sad: '#2196F3',
  angry: '#F44336',
};

const emotionFullNames = {
  neutral: "Neutral",
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
};

export default function FaceAnalysisBars({ smoothedEmotions }) {
  return (
      <div className="emotion-bar-graph" style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', height: '220px' }}>
      {['neutral', 'happy', 'sad', 'angry'].map((emotion) => {
        const match = smoothedEmotions.find((e) => e.emotion === emotion);
        const probability = match ? match.probability : 0;
        return (
          <div
            className="bar-container"
            key={emotion}
            style={{ textAlign: 'center' }}
          >
            <div
              className="bar-fill"
              style={{
                width: '40px',
                height: `${probability}px`,
                backgroundColor: emotionColors[emotion] || '#007bff',
                borderRadius: '8px 8px 0 0',
                transition: 'height 0.3s',
              }}
            />
            <div
              className="bar-label"
              style={{ marginTop: '8px', fontWeight: 'bold' }}
            >
              {emotionFullNames[emotion]}<br />
              {probability}%
            </div>
          </div>
        );
      })}
    </div>
  );
}