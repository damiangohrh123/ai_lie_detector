import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import PerformanceMonitor from '../utils/PerformanceMonitor';

const MODEL_URL = '/models';

export default function FaceExpressionDetector({ onEmotionsUpdate, videoFile = null, onVideoRef = null, onPlaybackEnd = null }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const endedHandlerRef = useRef(null);
  const [currentEmotions, setCurrentEmotions] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [playbackEnded, setPlaybackEnded] = useState(false);
  const dimsRef = useRef(null);

  // Performance monitoring (Comment out if not testing)
  //const performanceMonitor = useRef(new PerformanceMonitor('FaceDetection'));

  useEffect(() => {
    async function loadModels() {
      try {
        await Promise.all([
          // Load face detection model and expression recognition model
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        setModelsLoaded(true);

        // After models are loaded, decide whether to use video file or webcam
        videoFile ? startVideoFile() : startWebcam();
      } catch (error) {
        console.error('Error loading models:', error);
      }
    }

    // Function for starting video file playback
    function startVideoFile() {
    if (videoRef.current && videoFile) {
      const videoUrl = URL.createObjectURL(videoFile);
      videoRef.current.src = videoUrl;

        // Function to try to play video. If error, retry after 1 second.
        const playVideo = () => {
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err);
            setTimeout(() => videoRef.current.play().catch(console.error), 1000);
          });
        };

        const onMetadataLoaded = () => {
          // Cache dimensions once when video metadata loads
          if (canvasRef.current && videoRef.current) {
            dimsRef.current = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
          }
          // For uploaded files, allow audio playback and controls
          try {
            videoRef.current.muted = false;
            videoRef.current.controls = true;
          } catch (e) {}
          // Reset playback ended state when metadata loads
          setPlaybackEnded(false);
          playVideo();
        };

        function onEnded() {
          setPlaybackEnded(true);
          if (onPlaybackEnd && typeof onPlaybackEnd === 'function') {
            try { onPlaybackEnd(); } catch (e) { console.warn(e); }
          }
        }

        endedHandlerRef.current = onEnded;

        videoRef.current.addEventListener('loadedmetadata', onMetadataLoaded, { once: true });
        videoRef.current.addEventListener('ended', endedHandlerRef.current);
      }
    }

    // Function for starting webcam
    function startWebcam() {
      // Request access to user's webcam
      navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
          facingMode: 'user',
        }
      })
        // If permission granted, start video stream
        .then(stream => {
            if (videoRef.current) {
            videoRef.current.srcObject = stream;

            // Cache dimensions once when webcam metadata loads
            const onMetadataLoaded = () => {
              if (canvasRef.current && videoRef.current) {
                dimsRef.current = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
              }
            };

            videoRef.current.addEventListener('loadedmetadata', onMetadataLoaded, { once: true });
          }
        })
        .catch(err => console.error('Error accessing webcam:', err));
    }
    // Load both face detection and expression recognition models.
    loadModels();
  }, [videoFile]);

  useEffect(() => {
    if (!modelsLoaded) return;

    // TinyFaceDetector setup
    const tinyOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.5,
    });

    // Cache the 2D drawing canvas context to avoid repeated getContext calls.
    let ctx = canvasRef.current.getContext('2d');
    let lastFaceRegion = null;

    // Smart face skipping variables.
    let noFaceCount = 0;
    let lastProcessTime = 0;
    const PROCESS_INTERVAL = 200; // Process every 200ms
    let animationFrameId;

    const processFrame = async (timestamp) => {
      // Limits how often detection runs based on PROCESS_INTERVAL.
      if (timestamp - lastProcessTime < PROCESS_INTERVAL) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      // Ensure video is playing and both video and canvas refs exist
      if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      try {
        // START TIMING - Frame analysis begins (Comment out if not testing)
        //const frameStartTime = performance.now();
        //performanceMonitor.current.start();

        // Detect face and expressions. tinyOptions specifies detector variables. withFaceExpressions returns probabilities for emotions.
        const result = await faceapi.detectSingleFace(videoRef.current, tinyOptions).withFaceExpressions();

        // If a face is detected.
        if (result) {
          // Reset noFaceCount counter to indicate a face is present.
          noFaceCount = 0;

          // Optimize canvas clearing with dirty region tracking. Add padding of -30 and +60 to ensure region fully covers bounding box.
          const box = result.detection.box;
          const currentRegion = {
            x: Math.max(0, box.x - 30),
            y: Math.max(0, box.y - 30),
            width: Math.min(canvasRef.current.width - Math.max(0, box.x - 30), box.width + 60),
            height: Math.min(canvasRef.current.height - Math.max(0, box.y - 30), box.height + 60)
          };

          // Clear union of previous and current regions.
          if (lastFaceRegion) {
            const unionRegion = {
              x: Math.min(lastFaceRegion.x, currentRegion.x),
              y: Math.min(lastFaceRegion.y, currentRegion.y),
              width: Math.max(lastFaceRegion.x + lastFaceRegion.width, currentRegion.x + currentRegion.width) - Math.min(lastFaceRegion.x, currentRegion.x),
              height: Math.max(lastFaceRegion.y + lastFaceRegion.height, currentRegion.y + currentRegion.height) - Math.min(lastFaceRegion.y, currentRegion.y)
            };
            ctx.clearRect(unionRegion.x, unionRegion.y, unionRegion.width, unionRegion.height);
          } else {
            ctx.clearRect(currentRegion.x, currentRegion.y, currentRegion.width, currentRegion.height);
          }

          lastFaceRegion = currentRegion;

          // Draw the bounding box on the detected face.
          const resized = faceapi.resizeResults(result, dimsRef.current);
          faceapi.draw.drawDetections(canvasRef.current, resized);

          // Get the expressions and create emotions array directly
          const { expressions = {} } = resized;
          const allEmotions = [
            { emotion: 'neutral', probability: parseFloat(((expressions.neutral || 0) * 100).toFixed(1)) },
            { emotion: 'happy', probability: parseFloat(((expressions.happy || 0) * 100).toFixed(1)) },
            { emotion: 'sad', probability: parseFloat(((expressions.sad || 0) * 100).toFixed(1)) },
            { emotion: 'angry', probability: parseFloat(((expressions.angry || 0) * 100).toFixed(1)) },
            { emotion: 'disgusted', probability: parseFloat(((expressions.disgusted || 0) * 100).toFixed(1)) },
            { emotion: 'fearful', probability: parseFloat((((expressions.fearful || 0) + (expressions.surprised || 0)) * 100).toFixed(1)) }
          ];

          // END TIMING (Comment out if not testing)
          //performanceMonitor.current.end(true);

          // Immediate logging for testing (Comment out if not testing)
          //const processingTime = performance.now() - frameStartTime;
          //console.log(`Frame processed in ${processingTime.toFixed(0)}ms - SUCCESS`);

          // Update the component state with the latest emotions array.
          setCurrentEmotions(allEmotions);
        } else {
          noFaceCount++;

          // Only after 3 consecutive frames with no face, we consider the face gone.
          if (noFaceCount >= 3) {
            // Clear only the last known face region instead of entire canvas.
            if (lastFaceRegion) {
              ctx.clearRect(lastFaceRegion.x, lastFaceRegion.y, lastFaceRegion.width, lastFaceRegion.height);
              lastFaceRegion = null;
            }

            // END TIMING (Comment out if not testing)
            //performanceMonitor.current.end(false);

            // Reset emotions.
            setCurrentEmotions([]);
          }
          // If noFaceCount < 3, keep previous face detection visible
        }
      } catch (error) {
        // Log error and reset emotions.
        console.warn('Face detection error:', error);
        setCurrentEmotions([]);
      }

      lastProcessTime = timestamp;
      animationFrameId = requestAnimationFrame(processFrame);
    };

    // Start the animation frame loop
    animationFrameId = requestAnimationFrame(processFrame);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      // Clean up video stream when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      // Clean up video file URL
        if (videoRef.current) {
        if (videoRef.current.src && videoRef.current.src.startsWith('blob:')) {
          URL.revokeObjectURL(videoRef.current.src);
        }
        // remove 'ended' listener if present
        try {
          if (endedHandlerRef.current && videoRef.current.removeEventListener) {
            videoRef.current.removeEventListener('ended', endedHandlerRef.current);
          }
        } catch (e) {}
        // clear stored handler
        endedHandlerRef.current = null;
      }
    };
  }, [modelsLoaded, videoFile]);

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

  // simple handlers kept available if needed later
  function handleEnableSound() { if (videoRef.current) try { videoRef.current.muted = false; } catch (e) { /* ignore */ } }

    return (
    <div className="app-container" style={{ display: 'flex' }}>
      <div className="video-wrapper" style={{ position: 'relative' }}>
        <video
          ref={videoRef}
          autoPlay
          muted={videoFile ? false : true}
          playsInline
          width="960"
          height="540"
          controls={videoFile ? true : false}
          style={{ width: '640px', height: '360px' }}
        />
        <canvas
          ref={canvasRef}
          width="960"
          height="540"
          className="overlay-canvas"
          style={{ width: '640px', height: '360px', position: 'absolute', top: 0, left: 0 }}
        />

        {playbackEnded && (
          <div className="playback-feedback-overlay">
            <div className="playback-feedback-box">
              <div className="playback-feedback-message">Playback finished</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
