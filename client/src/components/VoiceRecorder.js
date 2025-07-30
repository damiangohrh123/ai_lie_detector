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
const RECONNECT_DELAY = 3000;
const MOVING_AVG_WINDOW = 3;

export default function VoiceRecorder({ setVoiceResults, setTranscriptHistory }) {
  const [results, setResults] = useState([]);
  const [transcriptHistory, setTranscriptHistoryState] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connecting', 'connected', 'disconnected', 'error'
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceEmotionHistory, setVoiceEmotionHistory] = useState([]);
  const wsRef = useRef(null);
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
      console.log("WebSocket connected to backend");
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
    };
    wsRef.current.onerror = () => setConnectionStatus('error');
    // Handle connection close and set status to 'disconnected'.
    wsRef.current.onclose = () => {
      console.log("WebSocket closed");
      setConnectionStatus('disconnected');
      
      // Auto-reconnect with increasing delays after each attempt.
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
        if (data.type !== "partial") {
          console.log("Received from backend:", data);
        }

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

  useEffect(() => {
    let audioContext, input, stream, workletNode;
    let isCancelled = false;
    
    const startStreaming = async () => {
      try {
        // Connect WebSocket first.
        connectWebSocket();

        // Access microphone.
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create audio context for processing audio.
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        input = audioContext.createMediaStreamSource(stream);

        // Load the audio worklet processor for PCM conversion.
        await audioContext.audioWorklet.addModule('/pcm-processor.js');
        workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');

        // Now mic groes through the worklet node.
        input.connect(workletNode);

        // Everytime the worklet node receives audio data, this function runs.
        workletNode.port.onmessage = (event) => {
          if (isCancelled) return;
          const inputData = event.data;
          
          // Convert Float32Array [-1,1] to Int16 PCM
          const pcm = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32767));
          }
          
          // If websocket is connected, send the PCM data to backend over websocket.
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(pcm.buffer);
            setIsProcessing(true);
          }
        };
      } catch (error) {
        console.error("Failed to start audio streaming:", error);
        setConnectionStatus('error');
      }
    };

    startStreaming();

    // Cleanup function to stop audio processing and close WebSocket connection.
    return () => {
      isCancelled = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (input) input.disconnect();
      if (workletNode) workletNode.disconnect();
      if (audioContext) audioContext.close();
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Notify parent of transcript changes
  useEffect(() => {
    if (setVoiceResults) setVoiceResults(results);
  }, [results, setVoiceResults]);

  // Notify parent of transcript history changes
  useEffect(() => {
    if (setTranscriptHistory) setTranscriptHistory(transcriptHistory);
  }, [transcriptHistory, setTranscriptHistory]);

  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connecting': return 'Connecting...';
      case 'connected': return isProcessing ? '🎤 Processing speech...' : '🟢 Connected';
      case 'error': return '❌ Connection error';
      case 'disconnected': return '🔴 Disconnected - Reconnecting...';
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
