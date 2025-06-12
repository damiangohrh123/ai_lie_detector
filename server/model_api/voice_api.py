from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import base64
import io
import torch
import torchaudio
from transformers import (
    Wav2Vec2ForSequenceClassification,
    Wav2Vec2FeatureExtractor,
    Wav2Vec2ForCTC,
    Wav2Vec2Tokenizer
)

app = FastAPI()

# CORS for dev + future Vercel/Render
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models ONCE on startup
emotion_model_name = "superb/wav2vec2-base-superb-er"
emotion_model = Wav2Vec2ForSequenceClassification.from_pretrained(emotion_model_name)
emotion_processor = Wav2Vec2FeatureExtractor.from_pretrained(emotion_model_name)
emotion_model.eval()

asr_model_name = "facebook/wav2vec2-base-960h"
asr_model = Wav2Vec2ForCTC.from_pretrained(asr_model_name)
asr_tokenizer = Wav2Vec2Tokenizer.from_pretrained(asr_model_name)
asr_model.eval()

emotion_labels = ["ang", "hap", "neu", "sad"]

def analyze_emotion(wav_bytes):
    audio_tensor, sr = torchaudio.load(io.BytesIO(wav_bytes))
    if sr != 16000:
        audio_tensor = torchaudio.transforms.Resample(sr, 16000)(audio_tensor)
    inputs = emotion_processor(audio_tensor.squeeze().numpy(), sampling_rate=16000, return_tensors="pt")
    with torch.no_grad():
        logits = emotion_model(**inputs).logits
    probs = torch.nn.functional.softmax(logits[0], dim=-1)
    return {label: round(float(probs[i]), 4) for i, label in enumerate(emotion_labels)}

def transcribe_audio(wav_bytes):
    audio_tensor, sr = torchaudio.load(io.BytesIO(wav_bytes))
    if sr != 16000:
        audio_tensor = torchaudio.transforms.Resample(sr, 16000)(audio_tensor)
    input_values = asr_tokenizer(audio_tensor.squeeze().numpy(), return_tensors="pt").input_values
    with torch.no_grad():
        logits = asr_model(input_values).logits
    predicted_ids = torch.argmax(logits, dim=-1)
    transcription = asr_tokenizer.decode(predicted_ids[0])
    return transcription.strip().capitalize()

@app.post("/analyze")
async def analyze(request: Request):
    data = await request.json()
    results = []

    for b64 in data.get("wav_buffers", []):
        wav_bytes = base64.b64decode(b64)
        emotion = analyze_emotion(wav_bytes)
        text = transcribe_audio(wav_bytes)
        results.append({
            "text": text,
            "emotion": emotion
        })

    return results
