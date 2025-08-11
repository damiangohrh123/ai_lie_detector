import React, { useState, useRef, useEffect } from "react";

const EMOTIONS = {
  neu: { name: "Neutral", color: '#9E9E9E' },
  hap: { name: "Happy", color: '#FFD700' },
  sad: { name: "Sad", color: '#2196F3' },
  ang: { name: "Angry", color: '#F44336' }
};

const WS_URL = "ws://localhost:8000/ws/audio";
const MOVING_AVG_WINDOW = 3;
const RECONNECT_DELAY = 3000;

export default function AudioProcessor({ 
  mode = 'video', // Live (webcam) or video (uploaded) mode
  videoFile = null, // A file object (e.g. mp4)
  videoRef = null, // A ref to the video element to get audio stream
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

  // WebSocket connection
  const connectWebSocket = () => {
    // If already connected, do nothing. Prevent multiple connections.
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    // If there's an existing connection that's not open, close it first
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }
    
    // Sets the status to 'connecting'. Creates a new WebSocket connection to WS_URL.
    setConnectionStatus('connecting');
    wsRef.current = new WebSocket(WS_URL);
    wsRef.current.binaryType = "arraybuffer";

    // On successful connection, set the status to 'connected' and reset reconnect attempts.
    wsRef.current.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
    };
    
    // On error, log it but don't set error status immediately (WebSocket errors are often transient)
    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      // Don't set error status here as it might be a transient error
    };
    
    // On close, set status to 'disconnected' and handle reconnection logic.
    wsRef.current.onclose = () => {
      setConnectionStatus('disconnected');
      
      // Auto-reconnect with increasing delay
      if (reconnectAttemptsRef.current < 5) {
        const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connectWebSocket();
        }, delay);
      }
    };

    // Handle incoming messages from the server (backend).
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Only process final text segments for transcript
        if (data.type === "text_sentiment" && data.text && data.text.trim()) {
          setResults(prev => {
            const newResults = [...prev, data];
            return newResults.slice(-3); // Keep last 3 results for fusion
          });
          setTranscriptHistoryState(prev => {
            const newHistory = [...prev, data];
            return newHistory; // Keep all transcript entries
          });
        }

        // Handle voice sentiment for emotion bars
        if (data.type === "voice_sentiment" && data.emotion) {
          setVoiceEmotionHistory(prev => {
            const updated = [...prev, data.emotion];
            return updated.slice(-MOVING_AVG_WINDOW); // 3 is the window size
          });
          // Also push to results for fusion
          setResults(prev => {
            const newResults = [...prev, { ...data, type: "voice_sentiment" }];
            return newResults.slice(-3);
          });
        }
      } catch (e) {
        console.warn("Failed to parse WebSocket message:", e);
      }
    };
  };



  // Initialize based on mode
  useEffect(() => {
    let isCancelled = false;
    
    const startStreaming = async () => {
      try {
        // Connect WebSocket first
        connectWebSocket();
        
        // Small delay to ensure WebSocket connection is established
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get audio source based on mode
        let stream;
        if (mode === 'live') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else if (mode === 'video' && videoRef) {
          try {
            stream = videoRef.captureStream();
            if (stream.getAudioTracks().length === 0) {
              throw new Error("No audio tracks in captureStream");
            }
          } catch (error) {
            // Fallback to MediaElementSource
            stream = null;
          }
        }

        // Create audio context
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        
        // Resume audio context if suspended
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        // Create source node
        sourceNodeRef.current = stream 
          ? audioContextRef.current.createMediaStreamSource(stream)
          : audioContextRef.current.createMediaElementSource(videoRef);

        // Setup worklet for PCM conversion
        try {
          await audioContextRef.current.audioWorklet.addModule('/pcm-processor.js');
          workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor');
        } catch (workletError) {
          console.error("Failed to load audio worklet:", workletError);
          // Don't set error status - WebSocket is working fine
          // Just log the error and continue
        }

        // Connect audio nodes only if worklet was created successfully
        if (workletNodeRef.current) {
          sourceNodeRef.current.connect(workletNodeRef.current);
          workletNodeRef.current.connect(audioContextRef.current.destination);

          // Process audio data
          workletNodeRef.current.port.onmessage = (event) => {
            if (isCancelled) return;
            const inputData = event.data;
            const hasAudioData = inputData.some(sample => Math.abs(sample) > 0.001);
            
            if (hasAudioData) {
              const pcm = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcm[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32767));
              }
              
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(pcm.buffer);
                setIsProcessing(true);
              }
            }
          };
        }
      } catch (error) {
        console.error("Failed to start audio streaming:", error);
        // Only set error status for non-transient errors
        if (error.name === 'InvalidStateError' || error.name === 'NotSupportedError') {
          setConnectionStatus('error');
        }
      }
    };

    // Start processing for live mode immediately
    if (mode === 'live') {
      startStreaming();
    } else if (mode === 'video' && videoRef && videoFile) {
      // For video mode, wait for video to be ready
      const handleVideoLoaded = () => startStreaming();
      
      if (videoRef.readyState >= 1) {
        handleVideoLoaded();
      } else {
        videoRef.addEventListener('loadedmetadata', handleVideoLoaded);
        return () => videoRef.removeEventListener('loadedmetadata', handleVideoLoaded);
      }
    }

    // Cleanup function
    return () => {
      isCancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionStatus('disconnected');
      setIsProcessing(false);
    };
  }, [mode, videoRef, videoFile]);

  // Notify parent components
  useEffect(() => {
    if (setVoiceResults) setVoiceResults(results);
  }, [results, setVoiceResults]);

  useEffect(() => {
    if (setTranscriptHistory) setTranscriptHistory(transcriptHistory);
  }, [transcriptHistory, setTranscriptHistory]);

  // Calculate average emotion
  const getAvgEmotion = (emotion) => {
    const validEmotions = voiceEmotionHistory.filter(e => e[emotion] !== undefined);
    if (validEmotions.length === 0) return 0;
    
    const sum = validEmotions.reduce((acc, e) => acc + e[emotion], 0);
    return (sum / validEmotions.length) * 100;
  };

  // Get connection status display
  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connecting': return 'Connecting...';
      case 'connected': return isProcessing ? '🎤 Processing speech...' : '🟢 Connected';
      case 'error': return '❌ Connection error';
      case 'disconnected': return '🔴 Disconnected - Reconnecting...';
      default: return 'Unknown status';
    }
  };

  return (
    <div className="voice-container">
      <div className="voice-connection-status">{getConnectionStatusDisplay()}</div>
      <div className="voice-analysis-container">
        {Object.entries(EMOTIONS).map(([key, { name, color }]) => (
          <div key={key} className="voice-analysis-bars">
            <span className="voice-analysis-bars-label">{name}</span>
            <div className="voice-analysis-bar-background">
              <div style={{
                width: `${getAvgEmotion(key)}%`,
                height: '100%',
                background: color,
                borderRadius: 4,
                transition: 'width 0.4s',
                opacity: connectionStatus === 'connected' ? 1 : 0.5
              }} />
            </div>
            <span style={{ 
              width: 50, 
              textAlign: 'right', 
              fontSize: '0.95em', 
              color: '#666', 
              fontWeight: '500' 
            }}>
              {getAvgEmotion(key).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
} 