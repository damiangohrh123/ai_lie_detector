import React, { useRef, useState } from 'react';

const FaceRecorder = () => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [emotionResults, setEmotionResults] = useState(null);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;

    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const base64 = await blobToBase64(blob);
      sendVideoToBackend(base64);

      // Stop webcam
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]); // remove base64 prefix
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const sendVideoToBackend = async (base64Video) => {
    try {
      const res = await fetch('http://localhost:5000/api/analyze-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoBase64: base64Video }),
      });

      const data = await res.json();
      setEmotionResults(data.emotionResults);
      console.log('Emotion Results:', data.emotionResults);
    } catch (err) {
      console.error('Failed to send video:', err);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Facial Expression Detection</h2>
      <video ref={videoRef} autoPlay muted className="w-full h-auto border mb-2" />

      {!recording ? (
        <button onClick={startRecording} className="bg-green-600 text-white px-4 py-2 rounded">
          Start Recording
        </button>
      ) : (
        <button onClick={stopRecording} className="bg-red-600 text-white px-4 py-2 rounded">
          Stop Recording
        </button>
      )}

      {emotionResults && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Emotion Predictions:</h3>
          {emotionResults.map((frameResult, idx) => (
            <div key={idx} className="mb-2">
              <strong>Frame {frameResult.frame}</strong>
              <ul className="ml-4">
                {Object.entries(frameResult.emotions).map(([emotion, score]) => (
                  <li key={emotion}>
                    {emotion}: {(score * 100).toFixed(2)}%
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FaceRecorder;