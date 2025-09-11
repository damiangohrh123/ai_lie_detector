import React, { useEffect, useRef } from 'react';

export default function SpeechPatternPanel({ segments = [] }) {
  // Capitalize first letters and standalone "i"s in transcript text
  const capitalizeTranscription = (text = '') => {
    if (typeof text !== 'string') return '';
    // Normalize whitespace
    let s = text.replace(/\s+/g, ' ').trim();

    // Fix common "i" pronoun and contractions (case-insensitive)
    s = s.replace(/\bi'm\b/gi, "I'm")
         .replace(/\bi've\b/gi, "I've")
         .replace(/\bi'd\b/gi, "I'd")
         .replace(/\bi'll\b/gi, "I'll")
         .replace(/\bi\b/g, "I");

    // Capitalize first letter of the string
    if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  };
  const riskFor = (p = 0) => (p > 0.66 ? 'HIGH' : p > 0.33 ? 'MED' : 'LOW');
  const containerRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when segments change
  useEffect(() => {
    if (bottomRef.current) {
      try {
        bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch (e) {
        // fallback to instant scroll if smooth isn't supported
        bottomRef.current.scrollIntoView(false);
      }
    }
  }, [segments]);

  return (
    <div className="speech-panel" ref={containerRef}>

      {segments.map((seg, i) => {
  const raw = seg.score || 0;
        const deceptiveProb = seg.label && seg.label.toLowerCase() === 'deceptive' ? raw : 1 - raw;
        const p = Math.max(0, Math.min(1, deceptiveProb));
        const risk = riskFor(p);

        const riskClass = p > 0.66 ? 'item-high' : p > 0.33 ? 'item-med' : 'item-low';

        return (
          <div key={i} className={`speech-card ${riskClass}`}>
            <div className="speech-card-text">"{capitalizeTranscription(seg.text)}"</div>

            <div className="speech-right-meta">
              <div className="speech-percent">{Math.round(p * 100)}%</div>
              <div className="speech-pill">{risk}</div>
            </div>
          </div>
        );
      })}

      {/* anchor element to scroll into view */}
      <div ref={bottomRef} />

    </div>
  );
}
