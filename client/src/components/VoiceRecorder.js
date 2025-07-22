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

// Environment-based WebSocket URL
const WS_URL = process.env.NODE_ENV === 'production' 
  ? process.env.REACT_APP_WS_URL || "wss://render-app.onrender.com/ws/audio"
  : "ws://localhost:8000/ws/audio";

const MAX_RESULTS = 10; // Keep only last 10 results
const RECONNECT_DELAY = 3000; // 3 seconds

export default function VoiceRecorder({ setVoiceResults }) {
  const [results, setResults] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connecting', 'connected', 'disconnected', 'error'
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

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

    // Handle errors and set connection status to 'error'
    wsRef.current.onerror = (err) => {
      console.error("WebSocket error:", err);
      setConnectionStatus('error');
    };

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
        console.log("Received from backend:", data);
        
        // Skip empty results or results with no meaningful content.
        if (!data.text?.trim() && (!data.emotion || Object.values(data.emotion).every(v => v < 0.1))) {
          return;
        }
        
        // Mark processing as complete
        setIsProcessing(false);

        // Add new results to end of the results array, and keep only the last MAX_RESULTS
        setResults((prev) => {
          const newResults = [...prev, data];
          return newResults.slice(-MAX_RESULTS);
        });
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (input) input.disconnect();
      if (workletNode) workletNode.disconnect();
      if (audioContext) audioContext.close();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Notify parent of transcript changes
  useEffect(() => {
    if (setVoiceResults) {
      setVoiceResults(results);
    }
  }, [results, setVoiceResults]);

  // Sum up emotions from all results to perform averaging.
  const emotionSums = {};
  results.forEach((result) => {
    const emotions = result.emotion || {};
    Object.entries(emotions).forEach(([emotionLabel, value]) => {
      if (!emotionSums[emotionLabel]) {
        emotionSums[emotionLabel] = 0;
      }
      emotionSums[emotionLabel] += value;
    });
  });

  // Calculate average emotions based on the number of results.
  const numberOfChunks = results.length || 1;
  const averageEmotions = [];
  for (const [emotionLabel, totalValue] of Object.entries(emotionSums)) {
    const average = (totalValue / numberOfChunks) * 100;
    averageEmotions.push({
      emotion: emotionLabel,
      probability: parseFloat(average.toFixed(1)),
    });
  }

  // Display connection status in the UI.
  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return isProcessing ? '🎤 Processing speech...' : '🟢 Connected - Listening';
      case 'error':
        return '❌ Connection error';
      case 'disconnected':
        return '🔴 Disconnected - Reconnecting...';
      default:
        return 'Unknown status';
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
        {getConnectionStatusDisplay()}
      </div>
      <div className="emotion-bar-graph">
        {['neu', 'hap', 'sad', 'ang'].map((emotion) => {
          const match = averageEmotions.find(e => e.emotion === emotion);
          const probability = match ? match.probability : 0;
          return (
            <div className="bar-container" key={emotion}>
              <div className="bar"
                style={{
                  height: `${probability * 1.5}px`,
                  backgroundColor: emotionColors[emotion] || '#007bff',
                  opacity: connectionStatus === 'connected' ? 1 : 0.5
                }}
              />
              <div className="bar-label">
                {emotionFullNames[emotion]}<br />{probability}%
              </div>
            </div>
          );
        })}
      </div>
      {results.length > 0 && (
        <div style={{ marginTop: '15px', fontSize: '12px', color: '#888' }}>
          Results: {results.length}/{MAX_RESULTS} (showing recent)
        </div>
      )}
    </div>
  );
}
