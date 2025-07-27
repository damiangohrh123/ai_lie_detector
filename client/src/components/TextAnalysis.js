import React, { useRef, useEffect } from 'react';

const sentimentMap = {
  NEUTRAL: { color: '#d1d5db', label: 'Neutral', text: '#374151', bg: '#f3f4f6' },
  truthful: { color: '#22c55e', label: 'Truthful', text: '#15803d', bg: '#dcfce7' },
  deceptive: { color: '#ef4444', label: 'Deceptive', text: '#b91c1c', bg: '#fee2e2' }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ color: '#22c55e', fontSize: 22 }}>💬</span>
        <span style={{ fontWeight: 600, fontSize: 20, color: '#15803d' }}>Speech Pattern Analysis</span>
      </div>
      {segments.length === 0 ? (
        <span style={{ color: '#aaa' }}>No transcript yet.</span>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflowY: 'auto',
          paddingRight: 4
        }}>
          {segments.map((seg, idx) => {
            const labelKey = (seg.label || '').toLowerCase();
            const sentiment = sentimentMap[labelKey] || sentimentMap.NEUTRAL;
            const truth = seg.label && seg.label.toLowerCase() === 'truthful' ? seg.score : 1 - (seg.score || 0);
            const deceptive = 1 - truth;
            return (
              <div
                key={idx}
                ref={idx === segments.length - 1 ? lastItemRef : null}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f9fafb',
                  borderRadius: 10,
                  padding: '18px 24px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  position: 'relative'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 500, color: '#374151', marginBottom: 8 }}>&quot;{seg.text}&quot;</div>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                    <span style={{ color: '#22c55e', fontWeight: 500, fontSize: 15 }}>● Truthful: {(truth * 100).toFixed(0)}%</span>
                    <span style={{ color: '#ef4444', fontWeight: 500, fontSize: 15 }}>● Deceptive: {(deceptive * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ position: 'absolute', right: 24, top: 24 }}>
                  <span style={{
                    background: sentiment.bg,
                    color: sentiment.text,
                    fontWeight: 600,
                    fontSize: 15,
                    borderRadius: 8,
                    padding: '4px 16px'
                  }}>
                    {sentiment.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}