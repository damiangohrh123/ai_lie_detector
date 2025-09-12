from fastapi import APIRouter, WebSocket
import io
import wave
import os
import torch
import torchaudio
import numpy as np
import httpx    
import time
import logging
from transformers import pipeline

# Import Vosk
from vosk import Model as VoskModel, KaldiRecognizer
import json
import noisereduce as nr
import webrtcvad
import asyncio
from scipy.signal import butter, lfilter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Reuse a single AsyncClient to avoid creating a new connection pool per request
async_client = httpx.AsyncClient(timeout=10.0)

# Load HuBERT SUPERB model once on startup
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
use_device = 0 if (device.type == 'cuda') else -1
emotion_pipe = pipeline("audio-classification", model="superb/hubert-large-superb-er", device=use_device)

# Load Vosk model once on startup
vosk_model = VoskModel("models/vosk-model-small-en-us-0.15") 

emotion_labels = ["ang", "hap", "neu", "sad"]

    """Health check endpoint for Render monitoring"""
    try:
        # Quick test to ensure models are loaded
        test_tensor = torch.zeros(1, 1000)  # 1000 samples = ~0.06s at 16kHz
        emotion_test, _ = analyze_emotion(test_tensor, 16000)

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
    window_seconds = 1.5 # 1.5 seconds window size for better emotion detection
    window_size = int(window_seconds * sample_rate * 2)  # 2 bytes per int16 sample, ensure integer
    stop_task = False

    async def perform_voice_sentiment():
        while not stop_task:
            if len(audio_buffer) >= window_size:
                # Snapshot the most recent window bytes and process in a thread pool to avoid
                # blocking the asyncio event loop with numpy/torch work.
                window_bytes = bytes(audio_buffer[-window_size:])
                try:
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(None, process_window_sync, window_bytes, sample_rate)
                    # Send the JSON payload back to the client
                    await websocket.send_text(json.dumps(result))
                except Exception as e:
                    logger.exception("Voice sentiment background processing failed: %s", e)
                    await websocket.send_text(json.dumps({
                        "type": "voice_sentiment",
                        "emotion": {label: 0.0 if label != "neu" else 1.0 for label in emotion_labels},
                        "error": str(e)
                    }))
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
                    transcript_start_time = time.time()
                    last_transcript = final_text
                    
                    # Text sentiment analysis: call the /api/text-sentiment endpoint
                    sentiment_start_time = time.time()
                    try:
                        resp = await async_client.post("http://localhost:8000/api/text-sentiment", json={"text": final_text})
                        sentiment = resp.json()
                    except Exception as e:
                        sentiment = {"label": None, "score": 0.0, "error": str(e)}
                    sentiment_time = time.time() - sentiment_start_time
                    
                    total_transcript_time = time.time() - transcript_start_time
                    # Comment out if not testing
                    # logger.info(f"📝 Text sentiment analysis completed in {total_transcript_time:.4f} seconds")
                    
                    await websocket.send_text(json.dumps({
                        "type": "text_sentiment",
                        "text": final_text,
                        "label": sentiment.get("label"),
                        "score": sentiment.get("score")
                    }))
            else:
                partial = json.loads(recognizer.PartialResult())
                await websocket.send_text(json.dumps({
                    "type": "partial",
                    "text": partial.get("partial", "")
                }))
    except Exception as e:
        # Comment out if not testing
        # logger.error(f"🔌 WebSocket closed or error: {e}")
        pass
    finally:
        stop_task = True
        await voice_sentiment_task
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


def process_window_sync(window_bytes, sr):
    """Synchronous helper intended to run in a thread pool. Processes a byte window and
    returns a JSON-serializable dict with emotion and speech_ratio. This avoids blocking
    the asyncio event loop when using numpy/torch.
    """
    try:
        # Convert bytes (int16) to float32 array in [-1, 1]
        audio_np = np.frombuffer(window_bytes, dtype=np.int16).astype(np.float32) / 32767.0

        # Run VAD (synchronous function) expecting a torch tensor shaped like (1, N)
        speech_segments = vad(torch.tensor(audio_np).unsqueeze(0), sr, aggressiveness=2)

        # Compute speech ratio based on window duration
        window_seconds = len(window_bytes) / (2.0 * sr)
        if speech_segments:
            total_speech = sum(end - start for start, end in speech_segments)
            speech_ratio = total_speech / max(1e-6, window_seconds)
        else:
            speech_ratio = 0.0

        if speech_ratio > 0.3:
            # Preprocess audio and run emotion analysis (both can be CPU-bound)
            filtered_audio = audio_preprocessing(audio_np, sr)
            segment_tensor = torch.tensor(filtered_audio).unsqueeze(0)
            emotion, _ = analyze_emotion(segment_tensor, sr)
            return {
                "type": "voice_sentiment",
                "emotion": emotion,
                "speech_ratio": round(speech_ratio, 2)
            }

        # Low speech activity -> return neutral/zeroed emotions
        return {
            "type": "voice_sentiment",
            "emotion": {label: 0.0 for label in emotion_labels},
            "speech_ratio": 0.0
        }
    except Exception as e:
        # On error, return a neutral payload with an error field
        return {
            "type": "voice_sentiment",
            "emotion": {label: 0.0 if label != "neu" else 1.0 for label in emotion_labels},
            "speech_ratio": 0.0,
            "error": str(e)
        }

@router.get("/health")
async def health_check():
    """Health check endpoint for Render monitoring"""
            if len(audio_buffer) >= window_size:
                # Snapshot the most recent window bytes and process in a thread pool to avoid
                # blocking the asyncio event loop with numpy/torch work.
                window_bytes = bytes(audio_buffer[-window_size:])
                try:
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(None, process_window_sync, window_bytes, sample_rate)
                    # Send the JSON payload back to the client
                    await websocket.send_text(json.dumps(result))
                except Exception as e:
                    logger.exception("Voice sentiment background processing failed: %s", e)
                    await websocket.send_text(json.dumps({
                        "type": "voice_sentiment",
                        "emotion": {label: 0.0 if label != "neu" else 1.0 for label in emotion_labels},
                        "error": str(e)
                    }))
                    if speech_segments:
                        # Calculate speech ratio to avoid processing very short speech
                        total_speech = sum(end - start for start, end in speech_segments)
                        speech_ratio = total_speech / window_seconds
                        
                        # Only process if speech ratio is high enough (>30%)
                        if speech_ratio > 0.3:
                            # Run audio preprocessing only when needed
                            filtered_audio = audio_preprocessing(audio_np, sample_rate)
                            segment_tensor = torch.tensor(filtered_audio).unsqueeze(0)
                            
                            # Analyze emotion on preprocessed audio
                            emotion, emotion_time = analyze_emotion(segment_tensor, sample_rate)
                            await websocket.send_text(json.dumps({
                                "type": "voice_sentiment",
                                "emotion": emotion,
                                "speech_ratio": round(speech_ratio, 2)
                            }))
                            # Comment out if not testing
                            # Find highest emotion and its confidence
                            #highest_emotion = max(emotion.items(), key=lambda x: x[1])
                            #emotion_name = {"ang": "Angry", "hap": "Happy", "neu": "Neutral", "sad": "Sad"}[highest_emotion[0]]
                            #logger.info(f"🎤 Voice emotion: {emotion_name} ({highest_emotion[1]:.1%}) in {emotion_time:.4f}s")
                        else:
                            # Low speech activity. Don't send anything
                            pass
                    else:
                        # No speech detected: send zeros
                        await websocket.send_text(json.dumps({
                            "type": "voice_sentiment",
                            "emotion": {label: 0.0 for label in emotion_labels},
                            "speech_ratio": 0.0
                        }))
                        # Comment out if not testing
                        # logger.info(f"🎤 No speech detected - neutral emotion sent")
                except Exception as e:
                    # Comment out if not testing
                    # logger.error(f"🎤 Voice sentiment error: {e}")
                    # Send neutral emotion on error so client knows something happened
                    await websocket.send_text(json.dumps({
                        "type": "voice_sentiment",
                        "emotion": {label: 0.0 if label != "neu" else 1.0 for label in emotion_labels},
                        "error": str(e)
                    }))
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
                    transcript_start_time = time.time()
                    last_transcript = final_text
                    
                    # Text sentiment analysis: call the /api/text-sentiment endpoint
                    sentiment_start_time = time.time()
                    try:
                        resp = await async_client.post("http://localhost:8000/api/text-sentiment", json={"text": final_text})
                        sentiment = resp.json()
                    except Exception as e:
                        sentiment = {"label": None, "score": 0.0, "error": str(e)}
                    sentiment_time = time.time() - sentiment_start_time
                    
                    total_transcript_time = time.time() - transcript_start_time
                    # Comment out if not testing
                    # logger.info(f"📝 Text sentiment analysis completed in {total_transcript_time:.4f} seconds")
                    
                    await websocket.send_text(json.dumps({
                        "type": "text_sentiment",
                        "text": final_text,
                        "label": sentiment.get("label"),
                        "score": sentiment.get("score")
                    }))
            else:
                partial = json.loads(recognizer.PartialResult())
                await websocket.send_text(json.dumps({
                    "type": "partial",
                    "text": partial.get("partial", "")
                }))
    except Exception as e:
        # Comment out if not testing
        # logger.error(f"🔌 WebSocket closed or error: {e}")
        pass
    finally:
        stop_task = True
        await voice_sentiment_task
