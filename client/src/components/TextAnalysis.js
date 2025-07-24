import React from 'react';

const sentimentMap = {
  NEUTRAL:  { color: 'gray', label: 'Neutral' },
  truthful: { color: 'green', label: 'Truthful' },
  deceptive: { color: 'red', label: 'Deceptive' }
};

export default function TextAnalysis({ transcript, segments = [] }) {
  return (
    <div className="text-analysis">
      <h3>Transcript</h3>
      <div className="transcript-box">
        {segments.length === 0 ? (
          <span style={{ color: '#aaa' }}>No transcript yet.</span>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {segments.map((seg, idx) => {
              // Only support new labels from backend
              const labelKey = (seg.label || '').toLowerCase();
              const sentiment = sentimentMap[labelKey] || {};
              return (
                <li key={idx} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', marginRight: 8 }}>{seg.text}</span>
                  {seg.label && (
                    <span style={{
                      color: 'white',
                      backgroundColor: sentiment.color,
                      borderRadius: '12px',
                      padding: '2px 10px',
                      marginLeft: 8,
                      fontSize: '0.95em',
                      display: 'inline-block',
                      minWidth: 70,
                      textAlign: 'center'
                    }}>
                      {sentiment.label || seg.label}
                      {typeof seg.score === 'number' &&
                        ` (${Math.round(seg.score * 100)}%)`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}