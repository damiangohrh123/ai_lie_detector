import React, { useEffect, useRef, useState } from "react";

export default function VoiceRecorder({ setVoiceResults }) {
  const [transcript, setTranscript] = useState("");
  const [emotion, setEmotion] = useState({});
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    const start = async () => {
      // Open WebSocket connection
      wsRef.current = new window.WebSocket("ws://localhost:5000/ws/stream");
      wsRef.current.binaryType = "arraybuffer";
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setTranscript(data.transcript || "");
        setEmotion(data.emotion || {});
        if (setVoiceResults) setVoiceResults([{ text: data.transcript, emotion: data.emotion }]);
      };

      // Get user's microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = audioCtxRef.current.createMediaStreamSource(stream);

      // ScriptProcessorNode is deprecated but still widely supported
      const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== 1) return;
        const input = e.inputBuffer.getChannelData(0); // Float32Array
        // Send as raw float32 PCM
        wsRef.current.send(input.buffer);
      };

      source.connect(processor);
      processor.connect(audioCtxRef.current.destination);
    };

    start();

    // Cleanup
    return () => {
      isCancelled = true;
      if (wsRef.current) wsRef.current.close();
      if (processorRef.current) processorRef.current.disconnect();
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, [setVoiceResults]);

  // UI: Show transcript and emotion
  return (
    <div>
      <h3>Live Transcript</h3>
      <div style={{ minHeight: 40, border: "1px solid #ccc", padding: 8 }}>{transcript}</div>
      <h3>Live Emotion</h3>
      <pre>{JSON.stringify(emotion, null, 2)}</pre>
    </div>
  );
}
