import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = process.env.PUBLIC_URL + '/models';

export default function FaceExpressionDetector() {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);
  const [smoothedEmotions, setSmoothedEmotions] = useState([]);
  const [emotionHistory, setEmotionHistory] = useState([]);

  const emotionColors = {
    neutral: '#9E9E9E',     // Gray
    happy: '#FFD700',       // Gold
    sad: '#2196F3',         // Blue
    angry: '#F44336',       // Red
    disgusted: '#8BC34A',   // Green
    fearful: '#673AB7',     // Purple
  };

  useEffect(() => {
    async function loadModels() {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      setLoading(false);
      startVideo();
    }

    function startVideo() {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => console.error('Error accessing webcam:', err));
    }

    loadModels();
  }, []);

  useEffect(() => {
    if (loading) return;

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 512,
      scoreThreshold: 0.3,
    });

    const intervalId = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      const result = await faceapi
        .detectSingleFace(videoRef.current, options)
        .withFaceExpressions();

      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      if (result) {
        const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        const resized = faceapi.resizeResults(result, dims);
        faceapi.draw.drawDetections(canvasRef.current, resized);

        const { expressions = {} } = resized;
        const grouped = {
          neutral: expressions.neutral || 0,
          happy: expressions.happy || 0,
          sad: expressions.sad || 0,
          angry: expressions.angry || 0,
          disgusted: expressions.disgusted || 0,
          fearful: (expressions.fearful || 0) + (expressions.surprised || 0),
        };

        setEmotionHistory(prev => {
          const recent = [...prev, grouped].slice(-10);
          const averaged = Object.keys(grouped).reduce((acc, key) => {
            acc[key] = recent.reduce((sum, e) => sum + (e[key] || 0), 0) / recent.length;
            return acc;
          }, {});

          const sorted = Object.entries(averaged)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([emotion, prob]) => ({
              emotion,
              probability: parseFloat((prob * 100).toFixed(1)),
            }));

          setSmoothedEmotions(sorted);
          return recent;
        });
      } else {
        setSmoothedEmotions([]);
        setEmotionHistory([]);
      }
    }, 300);

    return () => clearInterval(intervalId);
  }, [loading]);

  return (
    <div className="app-container" style={{ display: 'flex' }}>
      <div className="video-wrapper">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          width="640"
          height="480"
        />
        <canvas
          ref={canvasRef}
          width="640"
          height="480"
          className="overlay-canvas"
        />
      </div>

      <div className="emotion-bar-graph">
        {['neutral', 'happy', 'sad', 'angry', 'disgusted', 'fearful'].map((emotion) => {
          const match = smoothedEmotions.find(e => e.emotion === emotion);
          const probability = match ? match.probability : 0;
          return (
            <div className="bar-container" key={emotion}>
              <div
                className="bar-fill"
                style={{
                  height: `${probability * 2}px`,
                  backgroundColor: emotionColors[emotion] || '#007bff',
                }}
              />
              <div className="bar-label">
                {emotion} {probability}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
