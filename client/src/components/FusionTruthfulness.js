import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';

const isValid = arr => Array.isArray(arr) && arr.length === 2 && arr.every(x => typeof x === 'number');

function getConfidenceLabel(score) {
  if (score < 0.2) return 'High Confidence - Truthful';
  if (score < 0.5) return 'Likely Truthful';
  if (score < 0.8) return 'Likely Deceptive';
  return 'High Confidence - Deceptive';
}

export default function FusionTruthfulness({ face, voice, text, setFusionScore }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const lastRequestRef = useRef(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isValid(face) && !isValid(voice) && !isValid(text)) {
      setResult(null);
      if (setFusionScore) setFusionScore(null);
      return;
    }
    const now = Date.now();
    const timeSinceLast = now - lastRequestRef.current;
    if (timeSinceLast >= 1000) {
      sendFusionRequest();
      lastRequestRef.current = now;
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        sendFusionRequest();
        lastRequestRef.current = Date.now();
      }, 1000 - timeSinceLast);
    }

    function sendFusionRequest() {
      setError(null);
      fetch('http://localhost:8000/api/fusion-truthfulness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face, voice, text })
      })
        .then(res => res.json())
        .then(data => {
          setResult(data);
          if (setFusionScore && typeof data.score === 'number') {
            const truthScore = 1 - data.score;
            setFusionScore(truthScore);
          }
        })
        .catch(e => {
          setError('Failed to fetch fusion score');
          if (setFusionScore) setFusionScore(null);
        });
    }
  }, [face, voice, text, setFusionScore]);

  // Calculate truth score
  const truthScore = result ? 1 - result.score : null;
  const percent = truthScore !== null ? (truthScore * 100).toFixed(1) : null;
  const confidenceLabel = truthScore !== null ? getConfidenceLabel(result.score) : '';
  const barColor = truthScore !== null ? (truthScore > 0.5 ? '#22c55e' : (truthScore > 0.2 ? '#e69c14' : '#ef4444')) : '#9ca3af';

  const modalities = [
    { name: 'Voice', color: '#3b82f6' },
    { name: 'Face', color: '#a78bfa' },
    { name: 'Speech', color: '#22c55e' }
  ];

  return (
    <div className="fusion-card">
      {error && <div className="fusion-error">{error}</div>}
      {result && (
        <>
          <div className="fusion-percent" style={{ color: barColor }}>{percent}%</div>
          <div className="fusion-confidence" style={{ color: barColor }}>{confidenceLabel}</div>

          <div className="truth-score-bar-background" style={{ marginTop: 18 }}>
            <div className="truth-score-fill" style={{ width: `${truthScore * 100}%`, background: barColor }} />
          </div>

          <div className="fusion-modality-list">
            {modalities.map(m => (
              <div key={m.name} className="modality-pill">
                <span className="modality-dot" style={{ background: m.color }} />
                <span className="modality-name">{m.name}</span>
                <span className="modality-status">Contributing</span>
              </div>
            ))}
          </div>

          <div className="fusion-footer">0% = Highly Deceptive &nbsp;|&nbsp; 100% = Completely Truthful</div>
        </>
      )}
    </div>
  );
}

FusionTruthfulness.propTypes = {
  face: PropTypes.array,
  voice: PropTypes.array,
  text: PropTypes.array,
  setFusionScore: PropTypes.func
}; 