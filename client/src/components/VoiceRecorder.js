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

export default function VoiceRecorder() {
  const [results, setResults] = useState([]);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  const segmentDuration = 3000; // 3 Seconds

  useEffect(() => {
    let isCancelled = false;

    const start = async () => {
      try {
        // Get user's microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        // Store the stream and start recording the next chunk
        streamRef.current = stream;
        recordNextChunk();

      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    };

    const recordNextChunk = () => {
      // Check if the recording is cancelled or the stream is not available
      if (isCancelled || !streamRef.current) return;

      // Create media recorder with WebM/Opus audio format
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;
      let chunks = [];

      // When data is available, add it to the chunks array
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      /**
       * When the recording is stopped, send the chunks to the server.
       * Sends audio chunks to /analyze-voice API endpoint.
       * Appends emotions and transcript to results
       * Starts the next recording immediately.
       */
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
            setResults((prev) => [...prev, ...data]);
          } catch (err) {
            console.error("Error sending audio to server:", err);
          }
        }
        setTimeout(recordNextChunk, 0);
      };

      // Start recording the next chunk (3 seconds)
      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      }, segmentDuration);
    };

    start();

    // Cleanup function to stop the recording and release the stream
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
  const emotionSums = {};
  results.forEach((result) => { // Loop through each result
    const emotions = result.emotion || {};
  
    // Loop through each emotion and add to the running total
    Object.entries(emotions).forEach(([emotionLabel, value]) => {
      if (!emotionSums[emotionLabel]) {
        emotionSums[emotionLabel] = 0;
      }
      emotionSums[emotionLabel] += value;
    });
  });

  // Get the number of audio segments processed (avoid divide-by-zero)
  const numberOfChunks = results.length || 1;

  // Calculate average emotion percentages
  const averageEmotions = [];
  for (const [emotionLabel, totalValue] of Object.entries(emotionSums)) {
    const average = (totalValue / numberOfChunks) * 100;
    averageEmotions.push({
      emotion: emotionLabel,
      probability: parseFloat(average.toFixed(1)), // round to 1 decimal
    });
  }

  // Sort emotions by highest probability
  averageEmotions.sort((a, b) => b.probability - a.probability);

  // Keep only the top 4 emotions
  const topEmotions = averageEmotions.slice(0, 4);

  const combinedTranscript = results.map((r) => r.text).join(" ");

  return (
      <div className="emotion-bar-graph">
        {['neu', 'hap', 'sad', 'ang'].map((emotion) => {
          const match = topEmotions.find(e => e.emotion === emotion);
          const probability = match ? match.probability : 0;
          return (
            <div className="bar-container" key={emotion}>
              <div className="bar"
                style={{
                  height: `${probability * 1.5}px`,
                  backgroundColor: emotionColors[emotion] || '#007bff'
                }}
              />
              <div className="bar-label">
                {emotionFullNames[emotion]}<br />{probability}%
              </div>
            </div>
          );
        })}
      </div>
  );
};
