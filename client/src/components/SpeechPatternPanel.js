export default function SpeechPatternPanel({ segments = [] }) {
  const riskFor = (p = 0) => (p > 0.66 ? 'HIGH' : p > 0.33 ? 'MED' : 'LOW');

  return (
    <div className="speech-panel" style={{ padding: 6 }}>

      {segments.map((seg, i) => {
        const raw = seg.score || 0;
        const deceptiveProb = seg.label && seg.label.toLowerCase() === 'deceptive' ? raw : 1 - raw;
        const p = Math.max(0, Math.min(1, deceptiveProb));
        const risk = riskFor(p);

        const riskClass = p > 0.66 ? 'item-high' : p > 0.33 ? 'item-med' : 'item-low';

        return (
          <div key={i} className={`speech-card ${riskClass}`}>
            <div className="speech-card-text">&quot;{seg.text}&quot;</div>

            <div className="speech-right-meta">
              <div className="speech-percent">{Math.round(p * 100)}%</div>
              <div className="speech-pill">{risk}</div>
            </div>
          </div>
        );
      })}

    </div>
  );
}
