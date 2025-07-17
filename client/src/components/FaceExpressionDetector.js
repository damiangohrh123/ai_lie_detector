import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = process.env.PUBLIC_URL + '/models';

const FACE_DETECTOR = 'tiny';

export default function FaceExpressionDetector({ onEmotionsUpdate }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);
  const [smoothedEmotions, setSmoothedEmotions] = useState([]);
  const [emotionHistory, setEmotionHistory] = useState([]);

  useEffect(() => {
    async function loadModels() {
      if (FACE_DETECTOR === 'tiny') {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      } else {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      }
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

    // Detector options
    const tinyOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 512,
      scoreThreshold: 0.3,
    });
    const ssdOptions = new faceapi.SsdMobilenetv1Options({
      minConfidence: 0.5,
    });

    const intervalId = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      let result;
      if (FACE_DETECTOR === 'tiny') {
        result = await faceapi
          .detectSingleFace(videoRef.current, tinyOptions)
          .withFaceExpressions();
      } else {
        result = await faceapi
          .detectSingleFace(videoRef.current, ssdOptions)
          .withFaceExpressions();
      }

      // Draw overlay (face guide oval)
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      // Draw oval in the center as a face guide
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
      ctx.lineWidth = 3;
      const cx = canvasRef.current.width / 2;
      const cy = canvasRef.current.height / 2;
      const rx = canvasRef.current.width * 0.25;
      const ry = canvasRef.current.height * 0.33;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();

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
  );
}
