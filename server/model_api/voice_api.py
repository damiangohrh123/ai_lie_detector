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
# Add Vosk import
from vosk import Model as VoskModel, KaldiRecognizer
import json

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

# Load Vosk model (assume model is in 'vosk-model-small-en-us-0.15' directory)
vosk_model = VoskModel("vosk-model-small-en-us-0.15")

emotion_labels = ["ang", "hap", "neu", "sad"]

def load_and_preprocess_audio(wav_bytes, target_sr=16000):
    import io
    audio_tensor, sr = torchaudio.load(io.BytesIO(wav_bytes))
    if sr != target_sr:
        audio_tensor = torchaudio.transforms.Resample(sr, target_sr)(audio_tensor)
    if audio_tensor.shape[0] > 1:
        audio_tensor = audio_tensor[:1, :]
    return audio_tensor, target_sr

def analyze_emotion(audio_tensor, sr):
    inputs = emotion_processor(audio_tensor.squeeze().numpy(), sampling_rate=sr, return_tensors="pt")
    with torch.no_grad():
        logits = emotion_model(**inputs).logits
    probs = torch.nn.functional.softmax(logits[0], dim=-1)
    return {label: round(float(probs[i]), 4) for i, label in enumerate(emotion_labels)}

def transcribe_audio_vosk(audio_tensor, sr):
    import io, wave
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
