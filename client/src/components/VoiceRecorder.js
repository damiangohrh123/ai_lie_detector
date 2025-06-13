import React, { useState, useRef, useEffect } from "react";

const emotionColors = {
  neu: '#9E9E9E',
  hap: '#FFD700',
  sad: '#2196F3',
  ang: '#F44336',
};

const emotionFullNames = {
  neu: "Neutral",
  hap: "Happy",
  sad: "Sad",
  ang: "Angry",
};

export default function VoiceRecorder() {
  const [results, setResults] = useState([]);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);

  const segmentDuration = 3000;

  useEffect(() => {
    let isCancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        streamRef.current = stream;
        recordNextChunk(); // start the loop
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    };

    const recordNextChunk = () => {
      if (isCancelled || !streamRef.current) return;

      const mediaRecorder = new MediaRecorder(streamRef.current, {
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
          chunks.forEach((b, i) => fd.append("audioFiles", b, `chunk_${i}.webm`));
          try {
            const res = await fetch("http://localhost:5000/analyze-voice", {
              method: "POST",
              body: fd,
            });
            const data = await res.json();
            console.log("Chunk-level emotions:", data);
            setResults((prev) => [...prev, ...data]);
          } catch (err) {
            console.error("Error sending audio to server:", err);
          }
        }

        // Start next chunk immediately
        setTimeout(recordNextChunk, 0);
      };

      mediaRecorder.start();
      isRecordingRef.current = true;

      setTimeout(() => {
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
          isRecordingRef.current = false;
        }
      }, segmentDuration);
    };

    start();

    return () => {
      isCancelled = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Aggregate emotion results
  const emotionSums = results.reduce((acc, item) => {
    const emotion = item.emotion || {};
    for (const [key, value] of Object.entries(emotion)) {
      acc[key] = (acc[key] || 0) + value;
    }
    return acc;
  }, {});

  const numResults = results.length || 1;

  const averageEmotions = Object.entries(emotionSums).map(([emotion, sum]) => ({
    emotion,
    probability: parseFloat(((sum / numResults) * 100).toFixed(1)),
  }));

  const sortedAverages = averageEmotions
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4);

  const combinedTranscript = results.map((r) => r.text).join(" ");

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="emotion-bar-graph" style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', height: '220px' }}>
        {['neu', 'hap', 'sad', 'ang'].map((emotion) => {
          const match = sortedAverages.find(e => e.emotion === emotion);
          const probability = match ? match.probability : 0;
          return (
            <div className="bar-container" key={emotion} style={{ textAlign: 'center' }}>
              <div
                className="bar-fill"
                style={{
                  width: '40px',
                  height: `${probability * 2}px`,
                  backgroundColor: emotionColors[emotion] || '#007bff',
                  borderRadius: '8px 8px 0 0',
                  transition: 'height 0.3s',
                }}
              />
              <div className="bar-label" style={{ marginTop: '8px', fontWeight: 'bold' }}>
                {emotionFullNames[emotion]}<br />{probability}%
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '30px', maxWidth: '600px', textAlign: 'left', fontSize: '1.1rem' }}>
        <strong>Transcript:</strong>
        <p>{combinedTranscript || "..."}</p>
      </div>
    </div>
  );
};
