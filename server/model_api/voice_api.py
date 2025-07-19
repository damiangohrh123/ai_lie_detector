from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import base64
import io
import wave
import torch
import torchaudio
from transformers import (
    Wav2Vec2ForSequenceClassification,
    Wav2Vec2FeatureExtractor
)
# Add Vosk import
from vosk import Model as VoskModel, KaldiRecognizer
import json
import noisereduce as nr
import numpy as np

app = FastAPI()

# CORS for dev + future Vercel/Render
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models ONCE on startup
emotion_model = Wav2Vec2ForSequenceClassification.from_pretrained("superb/wav2vec2-base-superb-er")
emotion_processor = Wav2Vec2FeatureExtractor.from_pretrained("superb/wav2vec2-base-superb-er")
emotion_model.eval()

# Load Vosk model
vosk_model = VoskModel("vosk-model-small-en-us-0.15")

emotion_labels = ["ang", "hap", "neu", "sad"]

def load_and_preprocess_audio(wav_bytes, target_sr=16000):
    audio_tensor, sr = torchaudio.load(io.BytesIO(wav_bytes))
    if sr != target_sr:
        audio_tensor = torchaudio.transforms.Resample(sr, target_sr)(audio_tensor)
    if audio_tensor.shape[0] > 1:
        audio_tensor = audio_tensor[:1, :]
        
    # Apply noise reduction
    audio_np = audio_tensor.squeeze().numpy()
    reduced_noise = nr.reduce_noise(y=audio_np, sr=target_sr)
    audio_tensor = torch.tensor(reduced_noise).unsqueeze(0)
    return audio_tensor, target_sr

def analyze_emotion(audio_tensor, sr):
    inputs = emotion_processor(audio_tensor.squeeze().numpy(), sampling_rate=sr, return_tensors="pt")
    with torch.no_grad():
        logits = emotion_model(**inputs).logits
    probs = torch.nn.functional.softmax(logits[0], dim=-1)
    return {label: round(float(probs[i]), 4) for i, label in enumerate(emotion_labels)}

def transcribe_audio_vosk(audio_tensor, sr):
    # Convert to int16 PCM
    audio_tensor = (audio_tensor * 32767.0).clamp(-32768, 32767).to(torch.int16)
    wav_buffer = io.BytesIO()
    torchaudio.save(wav_buffer, audio_tensor, sr, format='wav')
    wav_buffer.seek(0)
    wf = wave.open(wav_buffer, "rb")
    rec = KaldiRecognizer(vosk_model, sr)
    result = ""
    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            res = json.loads(rec.Result())
            result += res.get("text", "") + " "
    res = json.loads(rec.FinalResult())
    result += res.get("text", "")
    wf.close()
    return result.strip().capitalize()

@app.post("/analyze")
async def analyze(request: Request):
    data = await request.json()
    results = []
    for b64 in data.get("wav_buffers", []):
        wav_bytes = base64.b64decode(b64)
        audio_tensor, sr = load_and_preprocess_audio(wav_bytes)
        emotion = analyze_emotion(audio_tensor, sr)
        text = transcribe_audio_vosk(audio_tensor, sr)
        results.append({
            "text": text,
            "emotion": emotion
        })
    return results

@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    sample_rate = 16000
    rec = KaldiRecognizer(vosk_model, sample_rate)
    audio_buffer = np.zeros(sample_rate * 3, dtype=np.float32)  # 3 seconds buffer
    buffer_pos = 0
    transcript = ""
    last_emotion = None
    chunk_size = int(0.5 * sample_rate)  # 0.5s chunks
    try:
        while True:
            data = await websocket.receive_bytes()
            # Convert bytes to numpy float32 PCM (assume frontend sends float32 PCM)
            chunk = np.frombuffer(data, dtype=np.float32)
            # Feed to Vosk (convert to int16 PCM)
            int16_chunk = (chunk * 32767.0).clip(-32768, 32767).astype(np.int16).tobytes()
            if rec.AcceptWaveform(int16_chunk):
                res = json.loads(rec.Result())
                if res.get("text"):
                    transcript += res["text"] + " "
            else:
                partial = json.loads(rec.PartialResult())
                # Optionally send partial transcript
                await websocket.send_json({"transcript": transcript + partial.get("partial", ""), "emotion": last_emotion})
            # Update audio buffer for emotion analysis
            n = len(chunk)
            if n >= len(audio_buffer):
                audio_buffer = chunk[-len(audio_buffer):]
            else:
                audio_buffer = np.roll(audio_buffer, -n)
                audio_buffer[-n:] = chunk
            buffer_pos += n
            # Every 1s, run emotion analysis and send update
            if buffer_pos >= sample_rate:
                buffer_pos = 0
                # Convert buffer to torch tensor
                audio_tensor = torch.tensor(audio_buffer).unsqueeze(0)
                # Apply noise reduction
                reduced_noise = nr.reduce_noise(y=audio_buffer, sr=sample_rate)
                audio_tensor = torch.tensor(reduced_noise).unsqueeze(0)
                # Run emotion analysis
                last_emotion = analyze_emotion(audio_tensor, sample_rate)
                await websocket.send_json({"transcript": transcript, "emotion": last_emotion})
    except WebSocketDisconnect:
        pass
