import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';

// Helper to check if a modality is present and valid
const isValid = arr => Array.isArray(arr) && arr.length === 2 && arr.every(x => typeof x === 'number');

export default function FusionTruthfulness({ face, voice, text }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const lastRequestRef = useRef(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    // Clear any pending timeout on unmount
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // Only send request at most once per second
    if (!isValid(face) && !isValid(voice) && !isValid(text)) {
      setResult(null);
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
        .then(data => setResult(data))
        .catch(e => setError('Failed to fetch fusion score'));
    }
  }, [face, voice, text]);

  return (
    <div className="fusion-container">
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {result && (
        <div>
          <div className="deceptive-score">
            Deceptive Score: {(result.score * 100).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

FusionTruthfulness.propTypes = {
  face: PropTypes.array,
  voice: PropTypes.array,
  text: PropTypes.array
}; 