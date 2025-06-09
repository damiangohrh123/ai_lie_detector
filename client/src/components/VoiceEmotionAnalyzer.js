import React, { useEffect, useRef, useState } from 'react';

const VoiceEmotionAnalyzer = () => {
  const [emotion, setEmotion] = useState('');
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            const formData = new FormData();
            formData.append('audio', event.data, 'chunk.wav');

            try {
              const res = await fetch('http://localhost:5000/analyze-audio', {
                method: 'POST',
                body: formData,
              });

              const text = await res.text();
              console.log('Emotion:', text);
              setEmotion(text);
            } catch (err) {
              console.error('Error analyzing audio:', err);
            }
          }
        };

        mediaRecorder.start(1000); // 1 second chunks
      } catch (err) {
        console.error('Mic access denied or other error:', err);
      }
    };

    startRecording();

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return (
    <div style={{ textAlign: 'center', paddingTop: '40px' }}>
      <h2>🎙️ Voice Emotion Analyzer</h2>
      <p>Detected Emotion: <strong>{emotion || 'Listening...'}</strong></p>
    </div>
  );
};

export default VoiceEmotionAnalyzer;
