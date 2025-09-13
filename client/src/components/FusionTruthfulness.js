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
  const lastPayloadRef = useRef(null);
  const REQUEST_INTERVAL = 500; // ms

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
    if (timeSinceLast >= REQUEST_INTERVAL) {
      sendFusionRequest();
      lastRequestRef.current = now;
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        sendFusionRequest();
        lastRequestRef.current = Date.now();
      }, REQUEST_INTERVAL - timeSinceLast);
    }

    function sendFusionRequest() {
      setError(null);
      // Deduplicate identical payloads to avoid unnecessary requests
      const payload = { face, voice, text };
      let payloadString;
      try {
        payloadString = JSON.stringify(payload);
      } catch (e) {
        payloadString = null;
      }
      if (payloadString && lastPayloadRef.current === payloadString) {
        // If we already sent same payload recently, skip request
        const since = Date.now() - lastRequestRef.current;
        if (since < REQUEST_INTERVAL) return;
      }
      if (payloadString) lastPayloadRef.current = payloadString;
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

  // Calculate truth score and presence
  const hasFace = isValid(face);
  const hasVoice = isValid(voice);
  const hasText = isValid(text);
  const anyPresent = hasFace || hasVoice || hasText;
  // serverHasContrib: whether backend reported any non-zero contribution
  const serverHasContrib = result && result.contributions ? Object.values(result.contributions).some(v => v > 0) : false;

  const truthScore = (result && anyPresent) ? (result.score !== null ? (1 - result.score) : null) : null;
  const percent = truthScore !== null ? (truthScore * 100).toFixed(1) : null;

  let confidenceLabel = '';
  if (truthScore !== null) {
    confidenceLabel = getConfidenceLabel(result ? result.score : 0);
  } else {
    confidenceLabel = 'No Modalities Present';
  }
  const barColor = truthScore !== null ? (truthScore > 0.5 ? '#22c55e' : (truthScore > 0.2 ? '#e69c14' : '#ef4444')) : '#9ca3af';

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return v ? v.trim() : fallback;
    } catch (e) {
      return fallback;
    }
  }

  const modalities = [
    { name: 'Voice', color: cssVar('--color-voice', '#60a5fa'), key: 'voice' },
    { name: 'Face', color: cssVar('--color-face', '#fb923c'), key: 'face' },
    { name: 'Speech', color: cssVar('--color-speech', '#34d399'), key: 'text' }
  ];

  return (
    <div className="fusion-card">
      {error && <div className="fusion-error">{error}</div>}
      <>
        <div className="fusion-percent" style={{ color: barColor }}>{percent !== null ? `${percent}%` : 'None'}</div>
        <div className="fusion-confidence" style={{ color: barColor }}>{confidenceLabel || ''}</div>
        <div className="fusion-footer">0% = Highly Deceptive &nbsp;|&nbsp; 100% = Completely Truthful</div>

        <div className="truth-score-bar-background" style={{ marginTop: 18 }}>
          <div
            className="truth-score-fill"
            style={{ width: truthScore !== null ? `${truthScore * 100}%` : '0%' }}
            aria-hidden={truthScore === null}
          >
            <div className="truth-segments">
              {(() => {
                const showAny = anyPresent && serverHasContrib;
                const order = [
                  { key: 'voice', color: cssVar('--color-voice', '#60a5fa') },
                  { key: 'face', color: cssVar('--color-face', '#fb923c') },
                  { key: 'text', color: cssVar('--color-speech', '#34d399') }
                ];

                if (!showAny) {
                  return [
                    <div
                      key="none"
                      className="truth-segment"
                      style={{ width: '100%', background: barColor }}
                    />
                  ];
                }

                // Calculate total contribution so we can show proportional slices inside the filled area
                const contribs = order.map(o => ({ key: o.key, color: o.color, value: result && result.contributions ? (result.contributions[o.key] || 0) : 0 }));
                const total = contribs.reduce((s, c) => s + Math.max(0, c.value), 0);

                if (total <= 0) {
                  return [<div key="none2" className="truth-segment" style={{ width: '100%', background: barColor }} />];
                }

                return contribs.map(c => {
                  const ratio = Math.max(0, c.value) / total;
                  return (
                    <div key={c.key} className="truth-segment" style={{ width: `${ratio * 100}%`, background: c.color }} />
                  );
                });
              })()}
            </div>
          </div>
        </div>

        <div className="fusion-modality-list">
          {modalities.map(m => {
            const weight = result && result.contributions ? (result.contributions[m.key] || 0) : 0;
            // Present only when both local input exists and server reports contribution
            const isPresent = (anyPresent && serverHasContrib) ? (weight > 0.001) : false;
            let isPrimary = false;
            if (result && result.contributions && anyPresent && serverHasContrib) {
              const keys = Object.keys(result.contributions);
              const maxKey = keys.length ? keys.reduce((a, b) => result.contributions[a] > result.contributions[b] ? a : b) : null;
              if (m.key === maxKey && weight > 0.001) isPrimary = true;
            }

            const displayLabel = isPresent ? 'Contributing' : 'Absent';
            const badgeClass = isPresent ? 'badge contributing' : 'badge absent';

            return (
              <div key={m.name} className={`modality-pill`}>
                <span className="modality-dot" style={{ background: m.color, boxShadow: isPrimary ? `0 0 8px ${m.color}` : 'none' }} />
                <span className="modality-name">{m.name}</span>
                <span className={`modality-status`}>
                  <span className={badgeClass}>{displayLabel}{isPresent ? ` (${Math.round(weight * 100)}%)` : ''}</span>
                </span>
              </div>
            );
          })}
        </div>
      </>
    </div>
  );
}

FusionTruthfulness.propTypes = {
  face: PropTypes.array,
  voice: PropTypes.array,
  text: PropTypes.array,
  setFusionScore: PropTypes.func
};