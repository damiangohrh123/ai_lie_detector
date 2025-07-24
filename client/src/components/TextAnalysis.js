import React from 'react';

const sentimentMap = {
  NEUTRAL: { color: 'gray', label: 'Neutral' },
  truthful: { color: 'green', label: 'Truthful' },
  deceptive: { color: 'red', label: 'Deceptive' }
};

export default function TextAnalysis({ transcript, segments = [] }) {
  return (
    <div className="transcript-box">
      
      {/* If no segments, show "No transcript yet.". Else displays the transcript. */}
      {segments.length === 0 ? (
        <span style={{ color: '#aaa' }}>No transcript yet.</span>
      ) : (
        <ul className="transcript-ul">
          {/* seg is the segment, idx is the index */}
          {segments.map((seg, idx) => {
            const labelKey = (seg.label || '');
            const sentiment = sentimentMap[labelKey] || {};
            return (
              <li key={idx} className="transcript-li">
                <span className="transcript-text">{seg.text}</span>
                {seg.label && (
                  <span className="transcript-label" style={{ backgroundColor: sentiment.color }}>
                    {sentiment.label || seg.label}
                    {typeof seg.score === 'number' && `(${Math.round(seg.score * 100)}%)`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}