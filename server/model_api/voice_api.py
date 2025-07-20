from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import io
import wave
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

app = FastAPI()

# CORS for dev + future Vercel/Render
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Wav2Vec2 model once on startup
emotion_model = Wav2Vec2ForSequenceClassification.from_pretrained("superb/wav2vec2-base-superb-er")
emotion_processor = Wav2Vec2FeatureExtractor.from_pretrained("superb/wav2vec2-base-superb-er")
emotion_model.eval()

# Load Vosk model once on startup
vosk_model = VoskModel("vosk-model-small-en-us-0.15")

emotion_labels = ["ang", "hap", "neu", "sad"]

def load_and_preprocess_audio(wav_bytes, target_sr=16000):
    # Turns bytes into a file-like object
    audio_tensor, sr = torchaudio.load(io.BytesIO(wav_bytes))

    # Resample to 16kHz if needed
    if sr != target_sr:
        audio_tensor = torchaudio.transforms.Resample(sr, target_sr)(audio_tensor)
    
    # Convert to mono channel if needed
    if audio_tensor.shape[0] > 1:
        audio_tensor = audio_tensor[:1, :]
        
    # Apply normalization
    audio_np = audio_tensor.squeeze().numpy()
    max_val = np.max(np.abs(audio_np))
    if max_val > 0:
        audio_np = audio_np / max_val

    # Apply noise reduction
    reduced_noise = nr.reduce_noise(y=audio_np, sr=target_sr,  prop_decrease=0.5)
    audio_tensor = torch.tensor(reduced_noise).unsqueeze(0)

    return audio_tensor, target_sr

def analyze_emotion(audio_tensor, sr):
    inputs = emotion_processor(audio_tensor.squeeze().numpy(), sampling_rate=sr, return_tensors="pt")
    with torch.no_grad():
        logits = emotion_model(**inputs).logits
    probs = torch.nn.functional.softmax(logits[0], dim=-1)

    # Returns a dictionary. E.g. { "ang": 0.02, "hap": 0.87, "neu": 0.05, "sad": 0.06 }
    return {label: round(float(probs[i]), 4) for i, label in enumerate(emotion_labels)}

def transcribe_audio_vosk(audio_tensor, sr):
    # Convert to int16 PCM. Scale by 32767 to 16-bit scale.
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

    # Get final chunk of transcribed text. Vosk mighthold onto remaining text. Add it to results.
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

@app.post("/analyze")
async def analyze(request: Request):
    data = await request.json()
    results = []

    # Loop over audio clips
    for b64 in data.get("wav_buffers", []):

        # Decode base64 audio into raw bytes, then convert to audio tensor and sample rate.
        wav_bytes = base64.b64decode(b64)
        audio_tensor, sr = load_and_preprocess_audio(wav_bytes)

        # Runs VAD on audio tensor
        speech_segments = vad(audio_tensor, sr)
        if not speech_segments:
            print("VAD: No speech detected in this audio chunk. Skipping analysis.")
        audio_np = audio_tensor.squeeze().numpy()

        # Loop over detected speech segments
        for s, e in speech_segments:
            start_idx = int(s * sr)
            end_idx = int(e * sr)
            segment_np = audio_np[start_idx:end_idx]

            # Skip over empty segments
            if len(segment_np) == 0:
                continue

            segment_tensor = torch.tensor(segment_np).unsqueeze(0)
            emotion = analyze_emotion(segment_tensor, sr) # Emotion sentiment analysis.
            text = transcribe_audio_vosk(segment_tensor, sr) # Text transcription using Vosk.
            results.append({
                "start": s,
                "end": e,
                "emotion": emotion,
                "text": text
            })
    return results
