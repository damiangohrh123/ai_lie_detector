import React, { useRef, useEffect, useState, useCallback } from 'react';
import PerformanceMonitor from '../utils/PerformanceMonitor';
import { FaceMesh } from '@mediapipe/face_mesh';
import * as faceapi from 'face-api.js';

export default function MediaPipeFaceDetector({ onEmotionsUpdate, videoFile = null, onVideoRef = null }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);
  const [currentEmotions, setCurrentEmotions] = useState([]);
  const [error, setError] = useState(null);
  const updateTimeoutRef = useRef(null);

  // Performance monitoring
  const performanceMonitor = useRef(new PerformanceMonitor('MediaPipeFaceMesh'));

  // MediaPipe references
  const faceMesh = useRef(null);
  
  // Face-api.js model loading state
  const faceApiModelsLoadedRef = useRef(false);

  useEffect(() => {
    async function loadModels() {
      try {
        setError(null);
        
        // Load face-api.js models
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/models');
        faceApiModelsLoadedRef.current = true;
        
        // Configure MediaPipe to use CPU only
        if (typeof window !== 'undefined') {
          window.MediaPipeWasmConfig = {
            useGPU: false,
            useCPU: true
          };
        }
        
        // Add timeout to prevent hanging
        const loadTimeout = setTimeout(() => {
          setError('MediaPipe loading timed out. Please refresh and try again.');
          setLoading(false);
        }, 30000);
        
        // Try to initialize with different WASM builds
        let faceMeshInstance = null;
        
        // First try: SIMD version (default)
        try {
          const config = {
            locateFile: (file) => `/models/mediapipe/${file}`,
            useGPU: false,
            useCPU: true
          };
          
          faceMeshInstance = new FaceMesh(config);
        } catch (simdError) {
          // Second try: Non-SIMD version
          try {
            const nonSimdConfig = {
              locateFile: (file) => {
                const nonSimdFile = file.replace('simd_wasm_bin', 'wasm_bin');
                return `/models/mediapipe/${nonSimdFile}`;
              },
              useGPU: false,
              useCPU: true
            };
            
            faceMeshInstance = new FaceMesh(nonSimdConfig);
          } catch (nonSimdError) {
            throw new Error(`MediaPipe initialization failed. SIMD error: ${simdError.message}, Non-SIMD error: ${nonSimdError.message}`);
          }
        }
        
        if (!faceMeshInstance) {
          throw new Error('Failed to create FaceMesh instance');
        }
        
        faceMesh.current = faceMeshInstance;
        
        // Set up face mesh options for better accuracy
        await faceMesh.current.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        // Set up result handler
        faceMesh.current.onResults(onFaceMeshResults);

        setLoading(false);
        clearTimeout(loadTimeout);

        // Start video
        videoFile ? startVideoFile() : startWebcam();
      } catch (error) {
        console.error('Error loading models:', error);
        setError(`Failed to load models: ${error.message}`);
        setLoading(false);
      }
    }

    function startVideoFile() {
      if (videoRef.current && videoFile) {
        const videoUrl = URL.createObjectURL(videoFile);
        videoRef.current.src = videoUrl;
        videoRef.current.load();
        videoRef.current.play().catch(console.error);
      }
    }

    function startWebcam() {
      navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        }
      })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.error('Error accessing webcam:', err));
    }

    loadModels();
  }, [videoFile]);

  const onFaceMeshResults = useCallback(async (results) => {
    try {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Use face-api.js for emotion detection if models are loaded
        if (faceApiModelsLoadedRef.current && videoRef.current) {
          const emotions = await detectEmotionsWithFaceAPI();
          
          // Update emotions
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
          }
          updateTimeoutRef.current = setTimeout(() => {
            setCurrentEmotions(emotions);
          }, 50);
        } else {
          // Set default emotions
          const defaultEmotions = [
            { emotion: 'neutral', probability: 100.0 },
            { emotion: 'happy', probability: 0.0 },
            { emotion: 'sad', probability: 0.0 },
            { emotion: 'angry', probability: 0.0 },
            { emotion: 'disgusted', probability: 0.0 },
            { emotion: 'fearful', probability: 0.0 }
          ];
          setCurrentEmotions(defaultEmotions);
        }

        // Draw detection on canvas
        drawLandmarks(landmarks);
        
        // End timing after successful processing
        performanceMonitor.current.end(true);
      } else {
        // No face detected
        clearCanvas();
        setCurrentEmotions([]);
        
        // End timing for no-face result
        performanceMonitor.current.end(false);
      }
    } catch (error) {
      console.warn('Error in face mesh results:', error);
      
      // End timing on error
      performanceMonitor.current.end(false);
    }
  }, []);

  // Use face-api.js for reliable emotion detection
  const detectEmotionsWithFaceAPI = async () => {
    try {
      if (!videoRef.current) {
        return getDefaultEmotions();
      }

      const tinyOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.5,
      });

      const result = await faceapi.detectSingleFace(videoRef.current, tinyOptions)
        .withFaceExpressions();

      if (result && result.expressions) {
        const { expressions = {} } = result;
        const grouped = {
          neutral: expressions.neutral || 0,
          happy: expressions.happy || 0,
          sad: expressions.sad || 0,
          angry: expressions.angry || 0,
          disgusted: expressions.disgusted || 0,
          fearful: (expressions.fearful || 0) + (expressions.surprised || 0),
        };

        const allEmotions = [
          { emotion: 'neutral', probability: parseFloat((grouped.neutral * 100).toFixed(1)) },
          { emotion: 'happy', probability: parseFloat((grouped.happy * 100).toFixed(1)) },
          { emotion: 'sad', probability: parseFloat((grouped.sad * 100).toFixed(1)) },
          { emotion: 'angry', probability: parseFloat((grouped.angry * 100).toFixed(1)) },
          { emotion: 'disgusted', probability: parseFloat((grouped.disgusted * 100).toFixed(1)) },
          { emotion: 'fearful', probability: parseFloat((grouped.fearful * 100).toFixed(1)) }
        ];

        return allEmotions;
      } else {
        return getDefaultEmotions();
      }
    } catch (error) {
      console.error('Error in face-api.js emotion detection:', error);
      return getDefaultEmotions();
    }
  };

  // Get default neutral emotions
  const getDefaultEmotions = () => {
    return [
      { emotion: 'neutral', probability: 100.0 },
      { emotion: 'happy', probability: 0.0 },
      { emotion: 'sad', probability: 0.0 },
      { emotion: 'angry', probability: 0.0 },
      { emotion: 'disgusted', probability: 0.0 },
      { emotion: 'fearful', probability: 0.0 }
    ];
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const drawLandmarks = (landmarks) => {
    if (!canvasRef.current || !landmarks) return;
    
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Draw face mesh landmarks
    ctx.fillStyle = '#00ff00';
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    
    // Draw all landmarks with different colors for key areas
    landmarks.forEach((landmark, index) => {
      if (landmark && typeof landmark.x === 'number' && typeof landmark.y === 'number') {
        const x = landmark.x * canvasRef.current.width;
        const y = landmark.y * canvasRef.current.height;
        
        // Color code different landmark areas
        if (index >= 0 && index <= 20) {
          ctx.fillStyle = '#0066ff';
        } else if (index >= 21 && index <= 100) {
          ctx.fillStyle = '#ffff00';
        } else if (index >= 101 && index <= 200) {
          ctx.fillStyle = '#ff8800';
        } else if (index >= 200 && index <= 300) {
          ctx.fillStyle = '#ff0000';
        } else if (index >= 300 && index <= 400) {
          ctx.fillStyle = '#8800ff';
        } else {
          ctx.fillStyle = '#00ff00';
        }
        
        // Draw key landmarks (every 5th point to avoid clutter)
        if (index % 5 === 0) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, 2 * Math.PI);
          ctx.fill();
          
          // Add landmark index for debugging
          if (index % 20 === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            ctx.fillText(index.toString(), x + 3, y - 3);
            ctx.fillStyle = '#00ff00';
          }
        }
      }
    });

    // Draw face outline (key facial boundary points)
    const faceOutlineIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    faceOutlineIndices.forEach((index, i) => {
      const landmark = landmarks[index];
      if (landmark && typeof landmark.x === 'number' && typeof landmark.y === 'number') {
        const x = landmark.x * canvasRef.current.width;
        const y = landmark.y * canvasRef.current.height;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    
    ctx.closePath();
    ctx.stroke();
    
    // Highlight specific landmarks we're using for emotion detection
    const keyLandmarks = [
      { index: 13, name: 'Upper Lip', color: '#ff00ff' },
      { index: 14, name: 'Lower Lip', color: '#ff00ff' },
      { index: 61, name: 'Left Mouth Corner', color: '#00ffff' },
      { index: 291, name: 'Right Mouth Corner', color: '#00ffff' },
      { index: 66, name: 'Left Eyebrow', color: '#ffff00' },
      { index: 296, name: 'Right Eyebrow', color: '#ffff00' },
      { index: 159, name: 'Left Eye Top', color: '#ff8800' },
      { index: 145, name: 'Left Eye Bottom', color: '#ff8800' },
      { index: 4, name: 'Nose Tip', color: '#ff0088' },
      { index: 6, name: 'Nose Bridge', color: '#ff0088' }
    ];
    
    keyLandmarks.forEach(({ index, name, color }) => {
      const landmark = landmarks[index];
      if (landmark && typeof landmark.x === 'number' && typeof landmark.y === 'number') {
        const x = landmark.x * canvasRef.current.width;
        const y = landmark.y * canvasRef.current.height;
        
        // Draw larger circle for key landmarks
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add label
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.fillText(name, x + 6, y + 4);
      }
    });
  };

  useEffect(() => {
    if (loading) return;

    const intervalId = setInterval(() => {
      if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) return;
      if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) return;

      try {
        // Process frame with MediaPipe
        if (faceMesh.current && videoRef.current) {
          try {
            // Start timing when we send the frame
            performanceMonitor.current.start();
            faceMesh.current.send({ image: videoRef.current });
          } catch (gpuError) {
            console.warn('GPU processing error, trying to recover:', gpuError);
            if (gpuError.message.includes('GPU') || gpuError.message.includes('gpu')) {
              faceMesh.current = null;
            }
            return;
          }
        }
      } catch (error) {
        console.warn('MediaPipe face mesh error:', error);
      }
    }, 300);

    return () => {
      clearInterval(intervalId);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [loading, videoFile]);

  // Send emotions to parent
  useEffect(() => {
    if (onEmotionsUpdate) onEmotionsUpdate(currentEmotions);
  }, [currentEmotions, onEmotionsUpdate]);

  // Send video ref to parent for audio processing
  useEffect(() => {
    if (onVideoRef && videoRef.current) {
      onVideoRef(videoRef.current);
    }
  }, [onVideoRef]);

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h3>MediaPipe Error</h3>
        <p>{error}</p>
        <p>Please check the console for more details.</p>
        <button onClick={() => window.location.reload()}>Reload Page</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h3>Loading MediaPipe FaceMesh...</h3>
        <p>Loading with proper configuration - this should work correctly!</p>
        <p>Check the console for detailed loading progress</p>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex' }}>
      <div className="video-wrapper">
        <video
          ref={videoRef}
          autoPlay={true}
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
