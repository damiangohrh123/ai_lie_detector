import React, { useState, useRef, useEffect } from "react";

const emotionColors = {
  neu: '#9E9E9E',
  hap: '#FFD700',
  sad: '#2196F3',
  ang: '#F44336'
};

const emotionFullNames = {
  neu: "Neutral",
  hap: "Happy",
  sad: "Sad",
  ang: "Angry"
};

const WS_URL = "ws://localhost:8000/ws/audio";
const MOVING_AVG_WINDOW = 3;
const RECONNECT_DELAY = 3000;

export default function AudioProcessor({ 
  mode = 'video', // 'live' or 'video'
  videoFile = null, 
  videoRef = null, 
  setVoiceResults, 
  setTranscriptHistory 
}) {
  const [results, setResults] = useState([]);
  const [transcriptHistory, setTranscriptHistoryState] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceEmotionHistory, setVoiceEmotionHistory] = useState([]);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const workletNodeRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  // WebSocket connection and message handling
  const connectWebSocket = () => {
    // If WebSocket is already connected, do nothing. This is to avoid creatng multiple websocket connections.
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnectionStatus('connecting');

    // Create a new WebSocket connection
    wsRef.current = new WebSocket(WS_URL);
    wsRef.current.binaryType = "arraybuffer";

    // When connection opens, set status to 'connected', and reset reconnect attempts.
    wsRef.current.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
    };

    // Handle connection errors and set status to 'error'.
    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus('error');
    };
    
    // Handle connection close and set status to 'disconnected'.
    wsRef.current.onclose = () => {
      setConnectionStatus('disconnected');
      
      // Auto-reconnect with increasing delays after each attempt
      if (reconnectAttemptsRef.current < 5) {
        const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connectWebSocket();
        }, delay);
      }
    };

    // Handle incoming messages from backend.
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Only process final text segments for transcript
        if (data.type === "text_sentiment" && data.text && data.text.trim()) {
          setResults(prev => [...prev, data]);
          setTranscriptHistoryState(prev => {
            const newHistory = [...prev, data];
            return newHistory;
          });
        }

        // Handle voice sentiment for emotion bars
        if (data.type === "voice_sentiment" && data.emotion) {
          setVoiceEmotionHistory(prev => {
            const updated = [...prev, data.emotion];
            return updated.slice(-MOVING_AVG_WINDOW);
          });
          // Also push to results for fusion
          setResults(prev => [...prev, { ...data, type: "voice_sentiment" }]);
        }
      } catch (e) {
        console.warn("Failed to parse WebSocket message:", e);
      }
    };
  };

  // Get audio source based on mode
  const getAudioSource = async () => {
    // If mode is live (webcam), get user media directly
    if (mode === 'live') {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } else {
      // Video mode - try captureStream first, then MediaElementSource
      if (!videoRef) throw new Error("Video reference required for video mode");
      
      try {
        const stream = videoRef.captureStream();
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error("No audio tracks in captureStream");
        }
        return stream;
      } catch (error) {
        // Fallback to MediaElementSource for uploaded files
        return null; // Will be handled in processAudio
      }
    }
  };

  // Process audio from any source
  const processAudio = async () => {
    try {
      // Connect WebSocket first
      connectWebSocket();

      // Create audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      
      if (mode === 'video') {
        // Ensure video is playing for audio capture
        if (videoRef && videoRef.paused) {
          try {
            await videoRef.play();
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (playError) {
            console.error("Failed to start video playback:", playError);
          }
        }
      }
      
      // Get audio source
      const stream = await getAudioSource();
      
      if (stream) {
        // Use MediaStreamSource for live audio or captureStream
        sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
      } else {
        // Use MediaElementSource for uploaded video files
        sourceNodeRef.current = audioContextRef.current.createMediaElementSource(videoRef);
      }

      // Load the audio worklet processor for PCM conversion
      await audioContextRef.current.audioWorklet.addModule('/pcm-processor.js');
      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor');

      // Connect the audio source through the worklet node
      sourceNodeRef.current.connect(workletNodeRef.current);
      
      // Connect to destination to avoid audio context suspension
      workletNodeRef.current.connect(audioContextRef.current.destination);

      // Process audio data from the worklet
      workletNodeRef.current.port.onmessage = (event) => {
        const inputData = event.data;
        
        // Check if we're getting actual audio data (not just silence)
        const hasAudioData = inputData.some(sample => Math.abs(sample) > 0.001);
        
        if (hasAudioData) {
          // Convert Float32Array [-1,1] to Int16 PCM
          const pcm = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32767));
          }
          
          // Send PCM data to backend if WebSocket is connected
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(pcm.buffer);
            setIsProcessing(true);
          }
        }
      };

      setConnectionStatus('connected');
    } catch (error) {
      console.error("Failed to process audio:", error);
      setConnectionStatus('error');
    }
  };

  // Start processing based on mode
  useEffect(() => {
    if (mode === 'live') {
      // Live mode - start immediately
      processAudio();
    } else if (mode === 'video' && videoRef && videoFile) {
      // Video mode - wait for video to load
      const handleVideoLoaded = async () => {
        processAudio();
      };

      if (videoRef.readyState >= 1) {
        // Video metadata is already loaded
        handleVideoLoaded();
      } else {
        // Wait for metadata to load
        videoRef.addEventListener('loadedmetadata', handleVideoLoaded);
        return () => {
          videoRef.removeEventListener('loadedmetadata', handleVideoLoaded);
        };
      }
    }

    return () => {
      // Cleanup
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
      if (workletNodeRef.current) workletNodeRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
      if (wsRef.current) wsRef.current.close();
    };
  }, [mode, videoRef, videoFile]);

  // Notify parent of transcript changes
  useEffect(() => {
    if (setVoiceResults) setVoiceResults(results);
  }, [results, setVoiceResults]);

  // Notify parent of transcript history changes
  useEffect(() => {
    if (setTranscriptHistory) setTranscriptHistory(transcriptHistory);
  }, [transcriptHistory, setTranscriptHistory]);

  const getConnectionStatusDisplay = () => {
    const modeText = mode === 'live' ? 'speech' : 'video audio';
    
    switch (connectionStatus) {
      case 'connecting': return 'Connecting...';
      case 'connected': return isProcessing ? `🎤 Processing ${modeText}...` : '🟢 Connected';
      case 'error': return '❌ Connection error';
      case 'disconnected': return reconnectAttemptsRef.current > 0 ? 
        `🔴 Disconnected - Reconnecting... (${reconnectAttemptsRef.current}/5)` : 
        '🔴 Disconnected';
      default: return 'Unknown status';
    }
  };

  // Moving average for emotion bars
  const getAvgEmotion = (emotion) => {
    let sum = 0, count = 0;
    voiceEmotionHistory.forEach(e => {
      if (e[emotion] !== undefined) {
        sum += e[emotion];
        count++;
      }
    });
    return count > 0 ? (sum / count) * 100 : 0;
  };

  return (
    <div className="voice-container">
      <div className="voice-connection-status"> {getConnectionStatusDisplay()} </div>
      <div className="voice-analysis-container">
        {['neu', 'hap', 'sad', 'ang'].map((emotion) => (
          <div key={emotion} className="voice-analysis-bars">
            <span className="voice-analysis-bars-label"> {emotionFullNames[emotion] }</span>
            <div className="voice-analysis-bar-background">
              <div style={{
                width: `${getAvgEmotion(emotion)}%`,
                height: '100%',
                background: emotionColors[emotion] || '#007bff',
                borderRadius: 4,
                transition: 'width 0.4s',
                opacity: connectionStatus === 'connected' ? 1 : 0.5
              }} />
            </div>
            <span style={{ width: 50, textAlign: 'right', fontSize: '0.95em', color: '#666', fontWeight: '500' }}>{getAvgEmotion(emotion).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
} 