// src/components/FaceExpressionDetector.js
import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = process.env.PUBLIC_URL + '/models';

export default function FaceExpressionDetector() {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadModels() {
      // Load Tiny Face Detector and Face Expression models
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
      if (
        !videoRef.current ||
        videoRef.current.paused ||
        videoRef.current.ended
      ) {
        return;
      }

      const options = new faceapi.TinyFaceDetectorOptions();

      const result = await faceapi
        .detectSingleFace(videoRef.current, options)
        .withFaceExpressions();

      if (result && canvasRef.current) {
        const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        const resizedResults = faceapi.resizeResults(result, dims);
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        faceapi.draw.drawDetections(canvasRef.current, resizedResults);
        faceapi.draw.drawFaceExpressions(canvasRef.current, resizedResults);
      } else if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    if (!loading) {
      intervalId = setInterval(onPlay, 100); // Run every 100 ms
    }

    return () => clearInterval(intervalId);
  }, [loading]);

  return (
    <div style={{ position: 'relative', width: '640px', margin: 'auto' }}>
      {loading && <p>Loading models, please wait...</p>}
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
  );
}
