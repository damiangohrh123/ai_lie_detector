import React, { useRef, useEffect } from 'react';

const sentimentMap = {
  NEUTRAL: { color: '#d1d5db', label: 'Neutral', text: '#374151', bg: '#f3f4f6' },
  truthful: { color: '#22c55e', label: 'Truthful', text: '#15803d', bg: '#dcfce7' },
  deceptive: { color: '#ef4444', label: 'Deceptive', text: '#b91c1c', bg: '#fee2fdff' }
};

export default function TextAnalysis({ transcript, segments = [] }) {
  const lastItemRef = useRef(null);

  useEffect(() => {
    if (lastItemRef.current) {
      lastItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [segments]);

  return (
    <div>
      {segments.length === 0 ? (
        <span className="no-transcript-placeholder">No transcript yet.</span>
      ) : (
        <div className="transcript-list-container">
          {segments.map((seg, idx) => {
            const labelKey = (seg.label || '').toLowerCase();
            const sentiment = sentimentMap[labelKey] || sentimentMap.NEUTRAL;
            const truth = seg.label && seg.label.toLowerCase() === 'truthful' ? seg.score : 1 - (seg.score || 0);
            const deceptive = 1 - truth;
            return (
              // Transcript box
              <div key={idx} ref={idx === segments.length - 1 ? lastItemRef : null} className="transcript-container" >
                <div style={{ flex: 1 }}>
                  <div className="transcript">&quot;{seg.text}&quot;</div>
                  <div className="transcript-confidence-container">
                    <span className="transcript-confidence-truthful">● Truthful: {(truth * 100).toFixed(0)}%</span>
                    <span className="transcript-confidence-deceptive">● Deceptive: {(deceptive * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="transcript-sentiment" style={{ background: sentiment.bg, color: sentiment.text }} >
                  {sentiment.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}