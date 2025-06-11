import React, { useState, useRef, useEffect } from "react";

const VoiceRecorder = () => {
  const [results, setResults] = useState([]);
  const mediaRecorderRef = useRef(null);
  const segmentTimerRef = useRef(null);
  const streamRef = useRef(null); // Save audio stream

  const segmentDuration = 3000;

  useEffect(() => {
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false, // just audio here
        });
        streamRef.current = stream;

        const startRecording = () => {
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: "audio/webm;codecs=opus",
          });
          mediaRecorderRef.current = mediaRecorder;

          let chunks = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data);
            }
          };

          mediaRecorder.onstop = async () => {
            if (chunks.length > 0) {
              const fd = new FormData();
              chunks.forEach((b, i) =>
                fd.append("audioFiles", b, `chunk_${i}.webm`)
              );
              try {
                const res = await fetch("http://localhost:5000/analyze-voice", {
                  method: "POST",
                  body: fd,
                });
                const data = await res.json();
                setResults((prev) => [...prev, ...data]);
              } catch (err) {
                console.error("Error sending audio to server:", err);
              }
              chunks = [];
            }
          };

          mediaRecorder.start();

          setTimeout(() => {
            mediaRecorder.stop(); // Triggers onstop
          }, segmentDuration);
        };

        // Record immediately and then at intervals
        startRecording();
        segmentTimerRef.current = setInterval(startRecording, segmentDuration);

      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    };

    start();

    return () => {
      clearInterval(segmentTimerRef.current);
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div>
      <h3>Voice Emotion Results:</h3>
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </div>
  );
};

export default VoiceRecorder;
