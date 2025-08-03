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
    
    // Sets the status to 'connecting'. Creates a new WebSocket connection to WS_URL.
    setConnectionStatus('connecting');
    wsRef.current = new WebSocket(WS_URL);
    wsRef.current.binaryType = "arraybuffer";

    // On successful connection, set the status to 'connected' and reset reconnect attempts.
    wsRef.current.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
    };
    
    // On error, log it and set the status to 'error'.
    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus('error');
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
        // Parse the incoming message as JSON.
        const data = JSON.parse(event.data);

        // If the message is a text sentiment, add it to results and transcript history.
        if (data.type === "text_sentiment" && data.text?.trim()) {
          setResults(prev => [...prev, data]);
          setTranscriptHistoryState(prev => [...prev, data]);
        }

        // If the message is a voice sentiment, update the voice emotion history and results.
        if (data.type === "voice_sentiment" && data.emotion) {
          setVoiceEmotionHistory(prev => {
            const updated = [...prev, data.emotion];
            return updated.slice(-MOVING_AVG_WINDOW);
          });
          setResults(prev => [...prev, { ...data, type: "voice_sentiment" }]);
        }
      } catch (e) {
        console.warn("Failed to parse WebSocket message:", e);
      }
    };
  };

  // Get audio source based on mode
  const getAudioSource = async () => {

    // If mode is 'live', use getUserMedia to capture audio from the microphone.
    if (mode === 'live') {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    
    // If mode is 'video', capture audio from the video element.
    if (!videoRef) throw new Error("Video reference required for video mode");
    try {
      const stream = videoRef.captureStream();
      if (stream.getAudioTracks().length === 0) {
        throw new Error("No audio tracks in captureStream");
      }
      return stream;
    } catch (error) {
      return null; // Will use MediaElementSource
    }
  };

  // Setup audio processing
  const setupAudioProcessing = async () => {
    // Create a new AudioContext with a sample rate of 16000 Hz
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    
    // Ensure video is playing for video mode
    if (mode === 'video' && videoRef?.paused) {
      try {
        await videoRef.play();
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error("Failed to start video playback:", error);
      }
    }
    
    // Get audio source based on mode
    const stream = await getAudioSource();
    
    // Create source node based on the stream
    sourceNodeRef.current = stream 
      ? audioContextRef.current.createMediaStreamSource(stream)
      : audioContextRef.current.createMediaElementSource(videoRef);

    // Setup worklet for PCM conversion
    await audioContextRef.current.audioWorklet.addModule('/pcm-processor.js');
    workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor');

    // Connect audio nodes
    sourceNodeRef.current.connect(workletNodeRef.current);
    workletNodeRef.current.connect(audioContextRef.current.destination);

    // Process audio data
    workletNodeRef.current.port.onmessage = (event) => {
      const inputData = event.data;
      const hasAudioData = inputData.some(sample => Math.abs(sample) > 0.001);
      
      // If there is audio data, convert it to PCM and send it via WebSocket.
      // This is to skip silent periods and reduce unnecessary data transmission.
      if (hasAudioData) {
        const pcm = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32767));
        }
        
        // If WebSocket is open, send the PCM data
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcm.buffer);
          setIsProcessing(true);
        }
      }
    };
  };

  // Start processing
  const startProcessing = async () => {
    try {
      connectWebSocket();
      await setupAudioProcessing();
      setConnectionStatus('connected');
    } catch (error) {
      console.error("Failed to process audio:", error);
      setConnectionStatus('error');
    }
  };

  // Initialize based on mode
  useEffect(() => {

    // Starts processing audio if mode is 'live'.
    if (mode === 'live') {
      startProcessing();

    // If mode is 'video', wait for the video element to load metadata before starting processing.
    } else if (mode === 'video' && videoRef && videoFile) {
      const handleVideoLoaded = () => startProcessing();

      if (videoRef.readyState >= 1) {
        handleVideoLoaded();
      } else {
        videoRef.addEventListener('loadedmetadata', handleVideoLoaded);
        return () => videoRef.removeEventListener('loadedmetadata', handleVideoLoaded);
      }
    }

    // Cleanup function to disconnect nodes and close WebSocket
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
      if (workletNodeRef.current) workletNodeRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
      if (wsRef.current) wsRef.current.close();
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