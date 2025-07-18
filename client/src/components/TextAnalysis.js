import React from 'react';

export default function TextAnalysis({ transcript }) {
  return (
    <div className="text-analysis">
      <h3>Transcript</h3>
      <div className="transcript-box">
        {transcript || <span style={{ color: '#aaa' }}>No transcript yet.</span>}
      </div>
    </div>
  );
}