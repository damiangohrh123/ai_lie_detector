import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import PerformanceMonitor from '../utils/PerformanceMonitor';

const MODEL_URL = '/models';

export default function FaceExpressionDetector({ onEmotionsUpdate, videoFile = null, onVideoRef = null }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);
  const [currentEmotions, setCurrentEmotions] = useState([]);
  const updateTimeoutRef = useRef(null);

  // Performance monitoring (Comment out if not testing)
  const performanceMonitor = useRef(new PerformanceMonitor('FaceDetection'));

  useEffect(() => {
    async function loadModels() {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      setLoading(false);

      // If videoFile is provided, start video file playback. Else, start webcam.
      videoFile ? startVideoFile() : startWebcam();
    }

    function startVideoFile() {
      if (videoRef.current && videoFile) {
        const videoUrl = URL.createObjectURL(videoFile);
        videoRef.current.src = videoUrl;
        videoRef.current.load();

        // Wait for video to be loaded before attempting to play
        const playVideo = () => {
          videoRef.current.play().then(() => {
            // Video started successfully
          }).catch(err => {
            console.error('Error playing video:', err);
            // Try again after a short delay
            setTimeout(() => {
              videoRef.current.play().catch(e => {
                console.error('Second attempt to play video failed:', e);
              });
            }, 1000);
          });
        };

        // Try to play when metadata is loaded
        videoRef.current.addEventListener('loadedmetadata', () => {
          playVideo();
        });

        // Also try to play when canplay event fires
        videoRef.current.addEventListener('canplay', () => {
          if (videoRef.current.paused) {
            playVideo();
          }
        });

        // Try to play when loadeddata event fires
        videoRef.current.addEventListener('loadeddata', () => {
          if (videoRef.current.paused) {
            playVideo();
          }
        });
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

  useEffect(() => {
    if (loading) return;

    // TinyFaceDetector setup
    const tinyOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.5,
    });

    // Cache canvas context to avoid repeated getContext calls
    const ctx = canvasRef.current.getContext('2d');

    // Smart face skipping variables
    let noFaceCount = 0;
    let frameSkipCount = 0;

    const intervalId = setInterval(async () => {
      // Make sure video is playing and both video and canvas refs exist
      if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) return;

      // Additional safety check for video dimensions
      if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) return;

      // Adaptive frame skipping for performance consistency
      if (frameSkipCount >= 2) {
        frameSkipCount = 0; // Reset counter
        return; // Skip this frame
      }

      try {
        // START TIMING - Frame analysis begins (Comment out if not testing)
        const frameStartTime = performance.now();
        performanceMonitor.current.start();

        // Detect facial expression using original video
        const detectionStartTime = performance.now();

        // Use original tinyOptions for compatibility
        const result = await faceapi.detectSingleFace(videoRef.current, tinyOptions).withFaceExpressions();
        const detectionTime = performance.now() - detectionStartTime;

        if (result) {
          // Update face detection tracking
          noFaceCount = 0;

          // Only clear the area around the detected face
          const box = result.detection.box;
          const clearMargin = 20; // Extra margin around face for safety
          ctx.clearRect(
            box.x - clearMargin,
            box.y - clearMargin,
            box.width + (clearMargin * 2),
            box.height + (clearMargin * 2)
          );

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

          // Create emotions array directly from current detection
          const allEmotions = [
            { emotion: 'neutral', probability: parseFloat((grouped.neutral * 100).toFixed(1)) },
            { emotion: 'happy', probability: parseFloat((grouped.happy * 100).toFixed(1)) },
            { emotion: 'sad', probability: parseFloat((grouped.sad * 100).toFixed(1)) },
            { emotion: 'angry', probability: parseFloat((grouped.angry * 100).toFixed(1)) },
            { emotion: 'disgusted', probability: parseFloat((grouped.disgusted * 100).toFixed(1)) },
            { emotion: 'fearful', probability: parseFloat((grouped.fearful * 100).toFixed(1)) }
          ];

          // END TIMING (Comment out if not testing)
          performanceMonitor.current.end(true);
          
          // Immediate logging for testing (Comment out if not testing)
          const processingTime = performance.now() - frameStartTime;
          console.log(`Frame processed in ${processingTime.toFixed(0)}ms - SUCCESS`);

          // Adaptive frame skipping for performance consistency
           if (detectionTime > 200) { // If detection takes too long
             frameSkipCount++;
           } else {
             frameSkipCount = 0; // Reset counter if performance is good
           }
        
          // Debounced state update to reduce re-renders
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
          }
          updateTimeoutRef.current = setTimeout(() => {
            setCurrentEmotions(allEmotions);
          }, 50); // 50ms debounce
        } else {
          // Only process after 3 consecutive no-face frames
          noFaceCount++;
          if (noFaceCount >= 3) {
            // Clear canvas when no face is detected for 3+ frames
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            // END TIMING (Comment out if not testing)
            performanceMonitor.current.end(false);

            setCurrentEmotions([]);
            noFaceCount = 0; // Reset counter after clearing
          }
          // If noFaceCount < 3, keep previous face detection visible
        }
      } catch (error) {
        // Handle any errors that might occur during face detection
        console.warn('Face detection error:', error);
        setCurrentEmotions([]);
      }
    }, 300);

    return () => {
      clearInterval(intervalId);

      // Clean up debounced updates
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Clean up video stream when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      // Clean up video file URL
      if (videoRef.current && videoRef.current.src && videoRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoRef.current.src);
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

  return (
    <div className="app-container" style={{ display: 'flex' }}>
      <div className="video-wrapper">
        <video
          ref={videoRef}
          autoPlay={true} // Auto-play for both webcam and video files
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
