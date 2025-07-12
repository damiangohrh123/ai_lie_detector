import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = process.env.PUBLIC_URL + '/models';

export default function FaceExpressionDetector({ onEmotionsUpdate }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);
  const [smoothedEmotions, setSmoothedEmotions] = useState([]);
  const [emotionHistory, setEmotionHistory] = useState([]);

  useEffect(() => {
    // Load tiny face detector and face expression net
    async function loadModels() {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      setLoading(false);
      startVideo();
    }
    
    // Start video
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

    // 512 resolution, and 0.3 confidence threshold
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 512,
      scoreThreshold: 0.3,
    });

    // Run every 300ms
    const intervalId = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      // Detect face and expressions
      const result = await faceapi
        .detectSingleFace(videoRef.current, options)
        .withFaceExpressions();

      // Clear canvas to reset detections
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      if (result) {
        // Draw the bounding box on the detected face
        const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        const resized = faceapi.resizeResults(result, dims);
        faceapi.draw.drawDetections(canvasRef.current, resized);

        // Get the expressions (Combine surprised and fearful)
        const { expressions = {} } = resized;
        const grouped = {
          neutral: expressions.neutral || 0,
          happy: expressions.happy || 0,
          sad: expressions.sad || 0,
          angry: expressions.angry || 0,
          disgusted: expressions.disgusted || 0,
          fearful: (expressions.fearful || 0) + (expressions.surprised || 0),
        };

        // Rolling average over last 10 frames
        setEmotionHistory(prev => {
          const recent = [...prev, grouped].slice(-10);

          // Compute average for each emotion
          const averaged = Object.keys(grouped).reduce((acc, key) => {
            acc[key] = recent.reduce((sum, e) => sum + (e[key] || 0), 0) / recent.length;
            return acc;
          }, {});

          // Sort and keep top 4
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

  // Send emotions to parent
  useEffect(() => {
    if (onEmotionsUpdate) onEmotionsUpdate(smoothedEmotions);
  }, [smoothedEmotions, onEmotionsUpdate]);

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
    </div>
  );
}
