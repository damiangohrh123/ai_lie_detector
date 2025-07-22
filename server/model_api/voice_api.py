from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import io
import wave
import os
import base64
import torch
import torchaudio
import numpy as np

# Import Wav2Vec2 model
from transformers import (
    Wav2Vec2ForSequenceClassification,
    Wav2Vec2FeatureExtractor
)

# Import Vosk
from vosk import Model as VoskModel, KaldiRecognizer
import json
import noisereduce as nr
import webrtcvad
import asyncio

app = FastAPI()

# CORS configuration
allowed_origins = ["*"] if os.getenv("ENVIRONMENT") == "development" else [
    "https://vercel-app.vercel.app",  # Replace with actual Vercel domain later
    "http://localhost:3000",  # For local development
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Load Wav2Vec2 model once on startup
emotion_model = Wav2Vec2ForSequenceClassification.from_pretrained("superb/wav2vec2-base-superb-er")
emotion_processor = Wav2Vec2FeatureExtractor.from_pretrained("superb/wav2vec2-base-superb-er")
emotion_model.eval()

# Load Vosk model once on startup
vosk_model = VoskModel("vosk-model-small-en-us-0.15")

emotion_labels = ["ang", "hap", "neu", "sad"]

def analyze_emotion(audio_tensor, sr):
    inputs = emotion_processor(audio_tensor.squeeze().numpy(), sampling_rate=sr, return_tensors="pt")
    with torch.no_grad():
        logits = emotion_model(**inputs).logits
    probs = torch.nn.functional.softmax(logits[0], dim=-1)

    # Returns a dictionary. E.g. { "ang": 0.02, "hap": 0.87, "neu": 0.05, "sad": 0.06 }
    return {label: round(float(probs[i]), 4) for i, label in enumerate(emotion_labels)}

def transcribe_audio_vosk(audio_tensor, sr):
    # Convert to int16. Scale by 32767 to 16-bit scale.
    audio_tensor = (audio_tensor * 32767.0).clamp(-32768, 32767).to(torch.int16)

    # Create a RAM buffer using `io.BytesIO()`
    # Save the audio tensor into this buffer. and reset buffer point to 0 so it can be read like a file.
    wav_buffer = io.BytesIO()
    torchaudio.save(wav_buffer, audio_tensor, sr, format='wav')
    wav_buffer.seek(0)

    # Open the wav stored in the buffer so we can read it. "rb" = read binary mode.
    wf = wave.open(wav_buffer, "rb")

    # Creates a Vosk recognizer instance.
    rec = KaldiRecognizer(vosk_model, sr)

    # Reads the audio file and appends the recognized text to result.
    result = ""
    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            res = json.loads(rec.Result())
            result += res.get("text", "") + " "

    # Get final chunk of transcribed text. Vosk might hold onto remaining text. Add it to results.
    res = json.loads(rec.FinalResult())
    result += res.get("text", "")

    # Close the wav file.
    wf.close()

    # Remove leading and trailing spaces, and capitlalize first letter.
    return result.strip().capitalize()

def vad(audio_tensor, sr, frame_duration_ms=30, aggressiveness=2):
    # Creates a VAD object
    vad = webrtcvad.Vad(aggressiveness)

    # squeeze() to remove extra dimensions. Converts from float32 to int16.
    audio = audio_tensor.squeeze().numpy()
    audio_pcm = (audio * 32767.0).astype('int16')

    # Calculates frame size and number of frames.
    frame_size = int(sr * frame_duration_ms / 1000)
    num_frames = len(audio_pcm) // frame_size

    segments = [] # Store start_time and end_time of speech
    triggered = False # Boolean flag to track if we are currently in a speech segment
    start_idx = 0

    # Loop through each frame,
    for i in range(num_frames):
        start = i * frame_size
        end = start + frame_size
        frame = audio_pcm[start:end]

        # Handle incomplete frames
        if len(frame) < frame_size:
            break

        # Check if current frame contains speech
        is_speech = vad.is_speech(frame.tobytes(), sr)

        # If speech detected and currently not in speech segment, mark start of speech.
        if is_speech and not triggered:
            triggered = True
            start_idx = start

        # If no speech detected and currently in speech segment, mark end of speech.
        elif not is_speech and triggered:
            triggered = False
            segments.append((start_idx / sr, end / sr))

    # If end of audio is reached and no silence detected after speech started, assume speech lasted entire duration.
    if triggered:
        segments.append((start_idx / sr, len(audio_pcm) / sr))
    return [(round(s, 2), round(e, 2)) for s, e in segments]

@app.get("/health")
async def health_check():
    """Health check endpoint for Render monitoring"""
    try:
        # Quick test to ensure models are loaded
        test_tensor = torch.zeros(1, 1000)  # 1000 samples = ~0.06s at 16kHz
        emotion_test = analyze_emotion(test_tensor, 16000)
        
        return {
            "status": "healthy",
            "models_loaded": True,
            "emotion_labels": emotion_labels,
            "vosk_model": "loaded"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "AI Lie Detector Voice API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "websocket": "/ws/audio"
        }
    }

@app.websocket("/ws/audio")
async def websocket_audio(websocket: WebSocket):
    await websocket.accept()
    buffer = bytearray() # Buffer to accumulate incoming audio data
    sample_rate = 16000
    chunk_size = int(1.5 * sample_rate) # Process in 1.5 second chunks (24000 samples)
    max_buffer_size = int(10 * sample_rate * 2)  # 10 seconds max buffer (2 bytes per int16)
    
    try:
        while True:
            data = await websocket.receive_bytes()
            
            # Prevent buffer overflow
            if len(buffer) > max_buffer_size:
                buffer = buffer[-chunk_size * 2:]  # Keep only last chunk worth of data
            
            # Append new data to buffer
            buffer.extend(data)
            
            # Loop keeps running if buffer has at least 1.5 seconds of audio.
            while len(buffer) >= chunk_size * 2:  # 2 bytes per int16
                chunk = buffer[:chunk_size * 2] # Get the first 1.5 seconds (in bytes) from the buffer
                buffer = buffer[chunk_size * 2:] # Remove processed chunk from buffer

                # Convert bytes to numpy array, then normalize to float32
                audio_np = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32767.0

                # Apply noise reduction
                audio_np = nr.reduce_noise(y=audio_np, sr=sample_rate, prop_decrease=1)
                
                # Convert to tensor for compatibility
                segment_tensor = torch.tensor(audio_np).unsqueeze(0)
                
                # Run VAD 
                speech_segments = vad(segment_tensor, sample_rate, aggressiveness=1)
                
                if not speech_segments:
                    print("VAD: No speech detected in this audio chunk. Skipping analysis.")
                    continue
                
                print(f"VAD: Detected speech segments: {speech_segments}")
                
                for s, e in speech_segments:
                    start_idx = int(s * sample_rate)
                    end_idx = int(e * sample_rate)
                    seg_np = audio_np[start_idx:end_idx]
                    
                    if len(seg_np) == 0:
                        continue
                    
                    # Skip very short segments (less than 0.3 seconds)
                    if len(seg_np) < int(0.3 * sample_rate):
                        print(f"Skipping short segment: {len(seg_np)/sample_rate:.2f}s")
                        continue
                    
                    seg_tensor = torch.tensor(seg_np).unsqueeze(0)
                    
                    try:
                        emotion = analyze_emotion(seg_tensor, sample_rate)
                        text = transcribe_audio_vosk(seg_tensor, sample_rate)
                        
                        # Skip results with very low confidence or empty text
                        max_emotion_confidence = max(emotion.values()) if emotion else 0
                        if max_emotion_confidence < 0.1 and not text.strip():
                            print("Skipping low-confidence result")
                            continue
                        
                        result = {
                            "start": round(s, 2),
                            "end": round(e, 2),
                            "emotion": emotion,
                            "text": text.strip(),
                            "confidence": round(max_emotion_confidence, 3)
                        }
                        
                        print("Sending result:", result)
                        await websocket.send_text(json.dumps(result))
                        
                    except Exception as processing_error:
                        print(f"Error processing segment: {processing_error}")
                        continue
                        
    except Exception as e:
        print("WebSocket closed or error:", e)
        try:
            await websocket.close()
        except:
            pass
