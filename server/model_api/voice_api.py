from fastapi import APIRouter, WebSocket
import io
import wave
import os
import torch
import torchaudio
import numpy as np
import httpx    

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
from scipy.signal import butter, lfilter

router = APIRouter()

# Load Wav2Vec2 model once on startup
emotion_model = Wav2Vec2ForSequenceClassification.from_pretrained("superb/wav2vec2-base-superb-er")
emotion_processor = Wav2Vec2FeatureExtractor.from_pretrained("superb/wav2vec2-base-superb-er")
emotion_model.eval()

# Load Vosk model once on startup
vosk_model = VoskModel("models/vosk-model-small-en-us-0.15")

emotion_labels = ["ang", "hap", "neu", "sad"]

def butter_bandpass(lowcut, highcut, fs, order=4):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    return b, a

def bandpass_filter(data, lowcut, highcut, fs, order=4):
    b, a = butter_bandpass(lowcut, highcut, fs, order=order)
    y = lfilter(b, a, data)
    return y

def analyze_emotion(audio_tensor, sr):
    inputs = emotion_processor(audio_tensor.squeeze().numpy(), sampling_rate=sr, return_tensors="pt")
    with torch.no_grad():
        logits = emotion_model(**inputs).logits
    probs = torch.nn.functional.softmax(logits[0], dim=-1)

    # Returns a dictionary. E.g. { "ang": 0.02, "hap": 0.87, "neu": 0.05, "sad": 0.06 }
    return {label: round(float(probs[i]), 4) for i, label in enumerate(emotion_labels)}

def vad(audio_tensor, sr, frame_duration_ms=30, aggressiveness=3):
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

@router.get("/health")
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

@router.get("/")
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

last_transcript = ""

@router.websocket("/ws/audio")
async def websocket_audio(websocket: WebSocket):
    global last_transcript
    await websocket.accept()
    sample_rate = 16000
    recognizer = KaldiRecognizer(vosk_model, sample_rate) # Creates a Vosk recognizer instance
    audio_buffer = bytearray()  # Buffer for sliding window (voice sentiment)
    window_seconds = 2 # 2 seconds window size for emotion analysis
    window_size = window_seconds * sample_rate * 2  # 2 bytes per int16 sample
    stop_task = False

    async def perform_voice_sentiment():
        while not stop_task:
            if len(audio_buffer) >= window_size:
                # Get the most recent window_size bytes
                window_bytes = audio_buffer[-window_size:]
                audio_np = np.frombuffer(window_bytes, dtype=np.int16).astype(np.float32) / 32767.0
                # Apply band-pass filter for speech (300-3400 Hz)
                filtered_audio = bandpass_filter(audio_np, 300, 3400, sample_rate)
                segment_tensor = torch.tensor(filtered_audio).unsqueeze(0)
                try:
                    # Run VAD to check for speech
                    speech_segments = vad(segment_tensor, sample_rate, aggressiveness=3)
                    if speech_segments:
                        emotion = analyze_emotion(segment_tensor, sample_rate)
                        await websocket.send_text(json.dumps({
                            "type": "voice_sentiment",
                            "emotion": emotion
                        }))
                    else:
                        # No speech detected: send zeros
                        await websocket.send_text(json.dumps({
                            "type": "voice_sentiment",
                            "emotion": {label: 0.0 for label in emotion_labels}
                        }))
                except Exception as e:
                    print(f"Voice sentiment error: {e}")
            await asyncio.sleep(1)

    voice_sentiment_task = asyncio.create_task(perform_voice_sentiment())
    
    try:
        while True:
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)

            # Keep buffer at most window_size * 2 (for safety)
            if len(audio_buffer) > window_size * 2:
                audio_buffer = audio_buffer[-window_size * 2:]

            # Feed data directly to Vosk recognizer
            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                final_text = result.get("text", "")

                if final_text.strip():
                    last_transcript = final_text
                    # Text sentiment analysis: call the /api/text-sentiment endpoint
                    async with httpx.AsyncClient() as client:
                        resp = await client.post("http://localhost:8000/api/text-sentiment", json={"text": final_text})
                        sentiment = resp.json()
                    await websocket.send_text(json.dumps({
                        "type": "text_sentiment",
                        "text": final_text,
                        "label": sentiment.get("label"),
                        "score": sentiment.get("score")
                    }))
                else:
                    await websocket.send_text(json.dumps({
                        "type": "text_sentiment",
                        "text": last_transcript,
                        "label": "NEUTRAL",
                        "score": 0.0
                    }))
            else:
                partial = json.loads(recognizer.PartialResult())
                await websocket.send_text(json.dumps({
                    "type": "partial",
                    "text": partial.get("partial", "")
                }))
    except Exception as e:
        print("WebSocket closed or error:", e)
    finally:
        stop_task = True
        await voice_sentiment_task
