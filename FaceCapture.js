import React, { useRef, useState } from 'react';

function FaceCapture() {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('video', blob, 'clip.webm');

      const response = await fetch('/api/analyze-face', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      console.log('Emotion Data:', data);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setRecording(true);

    setTimeout(() => {
      mediaRecorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
    }, 3000); // 3 second clip
  };

  return (
    <div>
      <video ref={videoRef} autoPlay muted style={{ width: 320 }} />
      <button onClick={startRecording} disabled={recording}>
        {recording ? 'Recording...' : 'Start Facial Scan'}
      </button>
    </div>
  );
}

export default FaceCapture;