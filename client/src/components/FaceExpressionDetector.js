import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = process.env.PUBLIC_URL + '/models';

export default function FaceExpressionDetector() {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);
  const [smoothedEmotions, setSmoothedEmotions] = useState([]);
  const [emotionHistory, setEmotionHistory] = useState([]);

  useEffect(() => {
    async function loadModels() {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      setLoading(false);
      startVideo();
    }

    function startVideo() {
      navigator.mediaDevices
        .getUserMedia({ video: {} })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.error('Error accessing webcam:', err));
    }

    loadModels();
  }, []);

  useEffect(() => {
    let intervalId;

    async function onPlay() {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 });

      const result = await faceapi
        .detectSingleFace(videoRef.current, options)
        .withFaceExpressions();

      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      if (result) {
        const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        const resizedResults = faceapi.resizeResults(result, dims);
        faceapi.draw.drawDetections(canvasRef.current, resizedResults);

        const expressions = resizedResults.expressions || {};
        const groupedExpressions = {
          neutral: expressions.neutral || 0,
          happy: expressions.happy || 0,
          sad: expressions.sad || 0,
          angry: expressions.angry || 0,
          disgusted: expressions.disgusted || 0,
          fearful: (expressions.fearful || 0) + (expressions.surprised || 0),
        };

        setEmotionHistory(prev => {
          const updated = [...prev, groupedExpressions].slice(-10); // keep last 10 frames

          // Average over history
          const averaged = {};
          Object.keys(groupedExpressions).forEach(key => {
            averaged[key] =
              updated.reduce((sum, e) => sum + (e[key] || 0), 0) / updated.length;
          });

          // Prepare for display
          const sorted = Object.entries(averaged)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([emotion, prob]) => ({
              emotion,
              probability: parseFloat((prob * 100).toFixed(1)),
            }));

          setSmoothedEmotions(sorted);
          return updated;
        });
      } else {
        setSmoothedEmotions([]);
        setEmotionHistory([]);
      }
    }

    if (!loading) {
      intervalId = setInterval(onPlay, 300);
    }

    return () => clearInterval(intervalId);
  }, [loading]);

  return (
    <div style={{ width: '640px', margin: 'auto' }}>
      {loading && <p>Loading models, please wait...</p>}
      <div style={{ position: 'relative' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          width="640"
          height="480"
          style={{ borderRadius: '10px' }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0 }}
          width="640"
          height="480"
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        {smoothedEmotions.length > 0 ? (
          <div>
            {smoothedEmotions.map(({ emotion, probability }) => (
              <div key={emotion} style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {emotion.charAt(0).toUpperCase() + emotion.slice(1)}: {probability}%
                </div>
                <div style={{
                  background: '#ddd',
                  borderRadius: '4px',
                  height: '16px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${probability}%`,
                    background: '#007bff',
                    height: '100%',
                    transition: 'width 0.6s ease'
                  }}></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>No face detected</div>
        )}
      </div>
    </div>
  );
}
