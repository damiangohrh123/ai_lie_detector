import React, { useRef, useEffect, useState, useCallback } from 'react';
import PerformanceMonitor from '../../client/src/utils/PerformanceMonitor';
import { FaceMesh } from '@mediapipe/face_mesh';
import * as faceapi from 'face-api.js';

export default function MediaPipeFaceDetector({ onEmotionsUpdate, videoFile = null, onVideoRef = null }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [currentEmotions, setCurrentEmotions] = useState([]);
  const [error, setError] = useState(null);

  // Performance monitoring
  const performanceMonitor = useRef(new PerformanceMonitor('MediaPipeFaceMesh'));

  // MediaPipe references
  const faceMesh = useRef(null);
  
  // Face-api.js model loading state
  const faceApiModelsLoadedRef = useRef(false);

  // Motion detection for frame optimization
  const lastFrameDataRef = useRef(null);
  const motionCanvasRef = useRef(null);
  const motionCtxRef = useRef(null);
  
  // Canvas optimization refs
  const lastFaceRegionRef = useRef(null);
  const animationFrameRef = useRef(null);
  const renderAnimationFrameRef = useRef(null);
  const processingQueueRef = useRef([]);
  const canvasStateRef = useRef({ ctx: null, width: 0, height: 0 });
  
  // Face outline landmarks for clean visual feedback
  const faceOutlineLandmarks = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

  useEffect(() => {
    async function loadModels() {
      try {
        setError(null);
        
        // Load face-api.js models
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/models');
        faceApiModelsLoadedRef.current = true;
        
        // Initialize MediaPipe FaceMesh
        const faceMeshInstance = new FaceMesh({
          locateFile: (file) => `/models/mediapipe/${file}`,
        });
        
        if (!faceMeshInstance) {
          throw new Error('Failed to create FaceMesh instance');
        }
        
        faceMesh.current = faceMeshInstance;
        
        // Set up face mesh options optimized for performance
        await faceMesh.current.setOptions({
          maxNumFaces: 1,
          refineLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          staticImageMode: false
        });

        // Set up result handler
        faceMesh.current.onResults(onFaceMeshResults);

        // Start video
        if (videoFile) {
          const videoUrl = URL.createObjectURL(videoFile);
          videoRef.current.src = videoUrl;
          videoRef.current.load();
          videoRef.current.play().catch(console.error);
        } else {
          navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
          })
            .then(stream => {
              if (videoRef.current) videoRef.current.srcObject = stream;
            })
            .catch(err => setError(`Webcam access failed: ${err.message}`));
        }
      } catch (error) {
        setError(`Failed to load models: ${error.message}`);
      }
    }

    loadModels();
  }, [videoFile]);

  // Motion detection to optimize frame processing
  const detectMotion = (currentFrame) => {
    if (!lastFrameDataRef.current || !currentFrame) return true; // Process first frame

    // Create reusable canvas and context on first use
    if (!motionCanvasRef.current) {
      motionCanvasRef.current = document.createElement('canvas');
      motionCanvasRef.current.width = 160; // Reduced resolution for motion detection
      motionCanvasRef.current.height = 120;
      motionCtxRef.current = motionCanvasRef.current.getContext('2d');
    }
    
    const ctx = motionCtxRef.current;
    const canvas = motionCanvasRef.current;
    
    // Draw current frame at reduced resolution
    ctx.drawImage(currentFrame, 0, 0, canvas.width, canvas.height);
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    // Compare with last frame using pixel sampling for 4x speed improvement
    let totalDifference = 0;
    let sampleCount = 0;
    
    // Sample every 4th pixel (16 = 4 pixels * 4 rgba values)
    for (let i = 0; i < currentData.length; i += 16) {
      // Calculate grayscale difference
      const currentGray = (currentData[i] + currentData[i + 1] + currentData[i + 2]) / 3;
      const lastGray = (lastFrameDataRef.current[i] + lastFrameDataRef.current[i + 1] + lastFrameDataRef.current[i + 2]) / 3;
      totalDifference += Math.abs(currentGray - lastGray);
      sampleCount++;
    }
    
    const avgDifference = totalDifference / sampleCount;
    lastFrameDataRef.current = currentData;
    
    // Return true if motion detected
    return avgDifference > 15;
  };

  const onFaceMeshResults = useCallback(async (results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      
      // Use face-api.js for emotion detection if models are loaded
      if (faceApiModelsLoadedRef.current && videoRef.current) {
        const emotions = await detectEmotionsWithFaceAPI();
        setCurrentEmotions(emotions);
      } else {
        setCurrentEmotions([]);
      }

      // Queue drawing operations for smooth rendering
      queueRender(() => drawLandmarks(landmarks));
      
      // End timing after successful processing
      performanceMonitor.current.end(true);
    } else {
      // Queue canvas clearing for no face detected
      queueRender(() => {
        if (lastFaceRegionRef.current) {
          clearCanvas(lastFaceRegionRef.current);
          lastFaceRegionRef.current = null;
        }
      });
      setCurrentEmotions([]);
      
      // End timing for no-face result
      performanceMonitor.current.end(false);
    }
  }, []);

  // Use face-api.js for reliable emotion detection
  const detectEmotionsWithFaceAPI = async () => {
    if (!videoRef.current) return [];

    const tinyOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 160,
      scoreThreshold: 0.5,
    });

    const result = await faceapi.detectSingleFace(videoRef.current, tinyOptions)
      .withFaceExpressions();

    if (!result?.expressions) return [];
    
    const exp = result.expressions;
    return [
      { emotion: 'neutral', probability: parseFloat(((exp.neutral || 0) * 100).toFixed(1)) },
      { emotion: 'happy', probability: parseFloat(((exp.happy || 0) * 100).toFixed(1)) },
      { emotion: 'sad', probability: parseFloat(((exp.sad || 0) * 100).toFixed(1)) },
      { emotion: 'angry', probability: parseFloat(((exp.angry || 0) * 100).toFixed(1)) },
      { emotion: 'disgusted', probability: parseFloat(((exp.disgusted || 0) * 100).toFixed(1)) },
      { emotion: 'fearful', probability: parseFloat((((exp.fearful || 0) + (exp.surprised || 0)) * 100).toFixed(1)) }
    ];
  };

  // Initialize canvas state once
  const initCanvas = () => {
    if (!canvasStateRef.current.ctx && canvasRef.current) {
      canvasStateRef.current = {
        ctx: canvasRef.current.getContext('2d'),
        width: canvasRef.current.width,
        height: canvasRef.current.height
      };
    }
    return canvasStateRef.current;
  };

  const clearCanvas = (region = null) => {
    if (!canvasRef.current) return;
    
    const { ctx, width, height } = initCanvas();
    const clearRegion = region || { x: 0, y: 0, width, height };
    
    const padding = 10;
    ctx.clearRect(
      Math.max(0, clearRegion.x - padding),
      Math.max(0, clearRegion.y - padding),
      Math.min(width - clearRegion.x + padding, clearRegion.width + padding * 2),
      Math.min(height - clearRegion.y + padding, clearRegion.height + padding * 2)
    );
  };

  const drawLandmarks = (landmarks) => {
    if (!canvasRef.current || !landmarks) return;
    
    const { ctx, width, height } = initCanvas();
    
    // Calculate face bounding box and prepare drawing in one loop
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const points = [];
    
    for (let i = 0; i < faceOutlineLandmarks.length; i++) {
      const landmark = landmarks[faceOutlineLandmarks[i]];
      if (landmark && typeof landmark.x === 'number' && typeof landmark.y === 'number') {
        const x = landmark.x * width;
        const y = landmark.y * height;
        points.push({ x, y });
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    
    if (points.length === 0) return;
    
    const currentFaceRegion = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    
    // Calculate union region for clearing
    let clearRegion = currentFaceRegion;
    if (lastFaceRegionRef.current) {
      const last = lastFaceRegionRef.current;
      clearRegion = {
        x: Math.min(last.x, currentFaceRegion.x),
        y: Math.min(last.y, currentFaceRegion.y),
        width: Math.max(last.x + last.width, currentFaceRegion.x + currentFaceRegion.width) - Math.min(last.x, currentFaceRegion.x),
        height: Math.max(last.y + last.height, currentFaceRegion.y + currentFaceRegion.height) - Math.min(last.y, currentFaceRegion.y)
      };
    }
    
    // Clear and draw
    clearCanvas(clearRegion);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
    
    lastFaceRegionRef.current = currentFaceRegion;
  };

  // Queue rendering operations for requestAnimationFrame
  const queueRender = (renderOperation) => {
    processingQueueRef.current.push(renderOperation);
    
    if (!renderAnimationFrameRef.current) {
      renderAnimationFrameRef.current = requestAnimationFrame(() => {
        processingQueueRef.current.forEach(op => op());
        processingQueueRef.current = [];
        renderAnimationFrameRef.current = null;
      });
    }
  };

  useEffect(() => {
    let lastProcessTime = 0;
    
    const processFrame = (timestamp) => {
      if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended || 
          !videoRef.current.videoWidth || !videoRef.current.videoHeight) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // Throttle processing to maintain consistent interval
      if (timestamp - lastProcessTime >= 200) {
        try {
          // Check for motion first - skip processing if no motion detected
          const hasMotion = detectMotion(videoRef.current);
          if (hasMotion && faceMesh.current) {
            performanceMonitor.current.start();
            faceMesh.current.send({ image: videoRef.current });
          }
          lastProcessTime = timestamp;
        } catch (error) {
          if (error.message && error.message.includes('memory access out of bounds')) {
            console.warn('MediaPipe memory error - skipping frame processing');
            return;
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    // Start the processing loop
    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      [animationFrameRef, renderAnimationFrameRef].forEach(ref => {
        if (ref.current) {
          cancelAnimationFrame(ref.current);
          ref.current = null;
        }
      });
      processingQueueRef.current = [];
    };
  }, [videoFile]);

  // Send emotions to parent and video ref for audio processing
  useEffect(() => {
    if (onEmotionsUpdate) onEmotionsUpdate(currentEmotions);
    if (onVideoRef && videoRef.current) onVideoRef(videoRef.current);
  }, [currentEmotions, onEmotionsUpdate, onVideoRef]);

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h3>MediaPipe Error</h3>
        <p>{error}</p>
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
