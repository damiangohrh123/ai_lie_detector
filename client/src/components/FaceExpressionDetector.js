import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';

export default function FaceExpressionDetector({ onEmotionsUpdate }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);
  const [smoothedEmotions, setSmoothedEmotions] = useState([]);

  useEffect(() => {
    async function loadModels() {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      setLoading(false);
      startVideo();
    }
    function startVideo() {
      navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        }
      })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => console.error('Error accessing webcam:', err));
    }
    loadModels();
  }, []);

  useEffect(() => {
    if (loading) return;

    const tinyOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 512,
      scoreThreshold: 0.3,
    });

    // Store last 10 frames for smoothing
    let emotionHistory = [];

    const intervalId = setInterval(async () => {
      // Make sure video is playing
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      // Always clear the canvas before drawing
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      // Detect facial expression
      const result = await faceapi.detectSingleFace(videoRef.current, tinyOptions).withFaceExpressions();

      if (result) {
        // Draw the bounding box on the detected face
        const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        const resized = faceapi.resizeResults(result, dims);
        faceapi.draw.drawDetections(canvasRef.current, resized);

        // Get the expressions (combine surprised and fearful)
        const { expressions = {} } = resized;
        const grouped = {
          neutral: expressions.neutral || 0,
          happy: expressions.happy || 0,
          sad: expressions.sad || 0,
          angry: expressions.angry || 0,
          disgusted: expressions.disgusted || 0,
          fearful: (expressions.fearful || 0) + (expressions.surprised || 0),
        };

        // Rolling average over last 5 frames
        emotionHistory = [...emotionHistory, grouped].slice(-5);
        const averaged = {};
        for (const key of Object.keys(grouped)) {
          const total = emotionHistory.reduce((sum, e) => sum + (e[key] || 0), 0);
          averaged[key] = total / emotionHistory.length;
        }

        const allEmotions = Object.entries(averaged).map(([emotion, prob]) => ({
          emotion,
          probability: parseFloat((prob * 100).toFixed(1)),
        }));
        setSmoothedEmotions(allEmotions);
      } else {
        setSmoothedEmotions([]);
        emotionHistory = [];
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
          width="1280"
          height="720"
          style={{ width: '640px', height: '360px' }}
        />
        <canvas
          ref={canvasRef}
          width="1280"
          height="720"
          className="overlay-canvas"
          style={{ width: '640px', height: '360px', position: 'absolute', top: 0, left: 0 }}
        />
      </div>
    </div>
  );
}
