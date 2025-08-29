import csv
import os
import time
import wave
import json

from vosk import Model, KaldiRecognizer
from transformers import pipeline
import whisper

ROOT = os.path.dirname(__file__)
AUDIO_DIR = os.path.join(ROOT, 'audio')

OUT = 'results.csv'
VOSK_MODEL_PATH = None
HF_MODEL = 'facebook/wav2vec2-base-960h'
WHISPER_MODELS = ['tiny', 'base', 'small']
DEVICE = -1

def init_vosk(vosk_model_path: str | None):
    model_path = vosk_model_path or os.path.join(os.path.dirname(ROOT), 'models', 'vosk-model-small-en-us-0.15')
    if not os.path.isdir(model_path):
        raise RuntimeError(f'Vosk model not found at {model_path}')
    return Model(model_path)

def transcribe_vosk(model, wav_path: str) -> str:
    with wave.open(wav_path, 'rb') as wf:
        rec = KaldiRecognizer(model, wf.getframerate())
        parts = []
        while True:
            data = wf.readframes(4000)
            if not data:
                break
            if rec.AcceptWaveform(data):
                parts.append(json.loads(rec.Result()).get('text', ''))
        parts.append(json.loads(rec.FinalResult()).get('text', ''))
    return ' '.join(filter(None, parts))

def init_hf(hf_model: str, device: int):
    return pipeline('automatic-speech-recognition', model=hf_model, device=device)

def transcribe_hf(pipe, wav_path: str) -> str:
    out = pipe(wav_path)
    return out['text'] if isinstance(out, dict) else str(out)

def init_whisper(whisper_model: str):
    return whisper.load_model(whisper_model)

def transcribe_whisper(model, wav_path: str) -> str:
    res = model.transcribe(wav_path, language='en', task='transcribe')
    return res.get('text', '').strip()

def main():
    if not os.path.isdir(AUDIO_DIR):
        raise RuntimeError(f'Bundled audio directory missing: {AUDIO_DIR}')

    wavs = [
        os.path.join(AUDIO_DIR, f)
        for f in sorted(os.listdir(AUDIO_DIR))
        if f.lower().endswith('.wav')
    ]
    if not wavs:
        raise RuntimeError('No WAV files found in bundled audio folder')

    results = []

    # Vosk
    print('Initializing Vosk...')
    vosk_model = init_vosk(VOSK_MODEL_PATH)
    for w in wavs:
        print('Vosk ->', os.path.basename(w))
        t0 = time.time()
        txt = transcribe_vosk(vosk_model, w)
        results.append({'model': 'vosk', 'audio': os.path.basename(w), 'transcript': txt, 'latency_s': time.time() - t0})

    # HF wav2vec2
    print('Initializing HuggingFace wav2vec2...')
    hf_pipe = init_hf(HF_MODEL, DEVICE)
    for w in wavs:
        print('HF ->', os.path.basename(w))
        t0 = time.time()
        txt = transcribe_hf(hf_pipe, w)
        results.append({'model': 'hf_wav2vec2', 'audio': os.path.basename(w), 'transcript': txt, 'latency_s': time.time() - t0})

    # Whisper (run multiple sizes)
    for wm in WHISPER_MODELS:
        print(f'Initializing Whisper {wm}...')
        whisper_model = init_whisper(wm)
        for w in wavs:
            print(f'Whisper {wm} ->', os.path.basename(w))
            t0 = time.time()
            txt = transcribe_whisper(whisper_model, w)
            results.append({'model': f'whisper_{wm}', 'audio': os.path.basename(w), 'transcript': txt, 'latency_s': time.time() - t0})

    # Save results
    out_dir = os.path.dirname(OUT) or '.'
    os.makedirs(out_dir, exist_ok=True)
    with open(OUT, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=['model', 'audio', 'transcript', 'latency_s'])
        writer.writeheader()
        writer.writerows(results)

    print('Wrote', OUT)

if __name__ == '__main__':
    main()
