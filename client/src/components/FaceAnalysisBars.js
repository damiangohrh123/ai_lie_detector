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

export default function FaceAnalysisBars({ smoothedEmotions }) {
  return (
    <div className="emotion-bar-graph">
      {['neutral', 'happy', 'sad', 'angry', 'disgusted', 'fearful'].map((emotion) => {
        const match = smoothedEmotions.find((e) => e.emotion === emotion);
        const probability = match ? match.probability : 0;
        return (
          <div className="bar-container" key={emotion}>
            <div className="bar"
              style={{
                height: `${probability * 1.5}px`,
                backgroundColor: emotionColors[emotion] || '#007bff',
              }}
            />
            <div className="bar-label">
              {emotionFullNames[emotion]}<br />{probability}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
