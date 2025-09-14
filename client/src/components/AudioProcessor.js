import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";

const EMOTIONS = {
  neu: { name: "Neutral", color: '#9E9E9E' },
  hap: { name: "Happy", color: '#FFD700' },
  sad: { name: "Sad", color: '#2196F3' },
  ang: { name: "Angry", color: '#F44336' }
};

// Determine WebSocket URL from environment. Prefer explicit WS var, else derive from API base.
const _API_BASE = (process.env.REACT_APP_API_BASE || 'http://localhost:8000').replace(/\/+$/, '');
const _WS_FROM_API = _API_BASE.replace(/^http/, 'ws');
const WS_URL = process.env.REACT_APP_API_WS || `${_WS_FROM_API}/ws/audio`;
const MOVING_AVG_WINDOW = 3;
const RECONNECT_DELAY = 3000;

function AudioProcessor({ 
  mode = 'video', // Live (webcam) or video (uploaded) mode
  videoFile = null, // A file object (e.g. mp4)
  videoRef = null, // A ref to the video element to get audio stream
  setVoiceResults, 
  setTranscriptHistory 
}, ref) {
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
  const transcriptBufferRef = useRef([]);
  const flushTimeoutRef = useRef(null);
  const MAX_SEGMENTS = 50;
  const INACTIVITY_MS = 1500; // clear voice inputs after 1.5s of silence
  const lastVoiceTimestampRef = useRef(null);

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
          // Skip single-word transcripts
          const textTrim = data.text.trim();
          const wordCount = textTrim.split(/\s+/).filter(Boolean).length;
          if (wordCount <= 1) {
            // Do not add to results or transcript buffer
            return;
          }
          // Keep last 3 results for fusion
          setResults(prev => {
            const newResults = [...prev, data];
            return newResults.slice(-3);
          });

          // Precompute segment fields to keep render cheap
          const seg = {
            text: data.text,
            label: data.label,
            score: typeof data.score === 'number' ? data.score : 0,
            start: Date.now(),
            // timeLabel precomputed to avoid Date formatting in render
            timeLabel: new Date().toLocaleTimeString(),
            tags: data.tags || []
          };

          // Buffer the segment and flush in a short batch to reduce re-renders
          transcriptBufferRef.current.push(seg);
          if (!flushTimeoutRef.current) {
            flushTimeoutRef.current = setTimeout(() => {
              const buffer = transcriptBufferRef.current.splice(0);
              flushTimeoutRef.current = null;
              setTranscriptHistoryState(prev => {
                const next = [...prev, ...buffer];
                return next.slice(-MAX_SEGMENTS);
              });
            }, 250); // 250ms batch window
          }
        }

        // Handle voice sentiment for emotion bars
        if (data.type === "voice_sentiment" && data.emotion) {
          // Add timestamp to emotion data latest emotions check
          const emotionWithTimestamp = {
            ...data.emotion,
            timestamp: Date.now()
          };
          
          setVoiceEmotionHistory(prev => {
            const updated = [...prev, emotionWithTimestamp];
            return updated.slice(-MOVING_AVG_WINDOW); // Window size is 3
          });
          // Also push to results for fusion
          setResults(prev => {
            const newResults = [...prev, { ...data, type: "voice_sentiment" }];
            // update last voice timestamp so inactivity watcher knows we just had voice
            lastVoiceTimestampRef.current = Date.now();
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
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
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

  // Expose a global clear hook so parent pages can wipe internal buffers after export
  // Provide a clear() method to parent via ref instead of using a global window variable
  const clearFn = () => {
    try {
      transcriptBufferRef.current = [];
      if (flushTimeoutRef.current) { clearTimeout(flushTimeoutRef.current); flushTimeoutRef.current = null; }
      setTranscriptHistoryState([]);
      setResults([]);
      setVoiceEmotionHistory([]);
    } catch (e) { /* ignore */ }
  };

  // Expose clear() to parent via ref
  // Stop processing. Disconnect nodes, close audio context and websocket
  const stopProcessing = () => {
    try {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch (e) {}
        sourceNodeRef.current = null;
      }
      if (workletNodeRef.current) {
        try { workletNodeRef.current.disconnect(); } catch (e) {}
        workletNodeRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (e) {}
        audioContextRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
        wsRef.current = null;
      }
      setConnectionStatus('disconnected');
      setIsProcessing(false);
    } catch (e) {
      console.warn('stopProcessing failed', e);
    }
  };

  useImperativeHandle(ref, () => ({ clear: clearFn, stop: stopProcessing }), [clearFn]);

  // Clean up old emotions periodically to reset bars when no recent sentiments
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setVoiceEmotionHistory(prev => {
        const recentEmotions = prev.filter(e => {
          if (e.timestamp) {
            return (now - e.timestamp) < 3000; // Keep only emotions from last 3 seconds
          }
          return false; // Only keep emotions with timestamps
        });
        return recentEmotions;
      });
    }, 1000); // Check every second

    return () => clearInterval(cleanupInterval);
  }, []);

  // Watch for voice inactivity and clear fusion inputs so voice stops contributing
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const last = lastVoiceTimestampRef.current;
      const now = Date.now();
      if (last && (now - last) > INACTIVITY_MS) {
        // Clear voice-related buffers and notify parent immediately
        try {
          if (results && results.length > 0) setResults([]);
        } catch (e) {}
        try {
          setVoiceEmotionHistory([]);
        } catch (e) {}
        try {
          setIsProcessing(false);
        } catch (e) {}
        try {
          if (setVoiceResults) setVoiceResults([]);
        } catch (e) {}
        // reset timestamp to avoid repeated clears
        lastVoiceTimestampRef.current = null;
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [results, setVoiceResults]);

  // Calculate average emotion
  // Memoize averages for all emotions to avoid repeated scans in render
  const avgEmotions = useMemo(() => {
    const now = Date.now();
    const windowMs = 3000;
    const out = {};
    Object.keys(EMOTIONS).forEach((emotion) => {
      const valid = voiceEmotionHistory.filter(e => e[emotion] !== undefined && e.timestamp && (now - e.timestamp) < windowMs);
      if (valid.length === 0) {
        out[emotion] = 0;
      } else {
        const sum = valid.reduce((acc, e) => acc + e[emotion], 0);
        out[emotion] = (sum / valid.length) * 100;
      }
    });
    return out;
  }, [voiceEmotionHistory]);

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
                width: `${avgEmotions[key]}%`,
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
              {avgEmotions[key].toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default forwardRef(AudioProcessor);