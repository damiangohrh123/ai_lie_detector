import os
import sys
import torch
import torchaudio
import webrtcvad
import numpy as np
from pydub import AudioSegment
from transformers import Wav2Vec2ForSequenceClassification, Wav2Vec2FeatureExtractor

AUDIO_FILE = "test.wav"

def read_wave(path):
    audio = AudioSegment.from_wav(path)
    audio = audio.set_channels(1).set_frame_rate(16000)
    raw_data = audio.raw_data
    return raw_data, 16000

def frame_generator(frame_duration_ms, audio, sample_rate):
    n = int(sample_rate * frame_duration_ms / 1000)
    offset = 0
    while offset + n < len(audio) // 2:
        yield audio[offset * 2:(offset + n) * 2]
        offset += n

def vad_collector(audio, sample_rate=16000, frame_duration_ms=30):
    vad = webrtcvad.Vad(3)
    frames = frame_generator(frame_duration_ms, audio, sample_rate)
    speech_segments = []
    for frame in frames:
        if vad.is_speech(frame, sample_rate):
            speech_segments.append(frame)
    return speech_segments

def save_temp_wav(data, filename, sample_rate=16000):
    audio = AudioSegment(data, sample_width=2, frame_rate=sample_rate, channels=1)
    audio.export(filename, format="wav")

def load_model():
    model_name = "superb/wav2vec2-base-superb-er"
    model = Wav2Vec2ForSequenceClassification.from_pretrained(model_name)
    extractor = Wav2Vec2FeatureExtractor.from_pretrained(model_name)
    return model, extractor

def predict_emotion(model, extractor, path):
    waveform, sr = torchaudio.load(path)
    if sr != 16000:
        resampler = torchaudio.transforms.Resample(sr, 16000)
        waveform = resampler(waveform)
        sr = 16000
    inputs = extractor(waveform.squeeze().numpy(), sampling_rate=sr, return_tensors="pt")
    with torch.no_grad():
        logits = model(**inputs).logits
    probs = torch.nn.functional.softmax(logits, dim=1)[0]
    pred_id = torch.argmax(probs).item()
    emotion = model.config.id2label[pred_id]
    print(f"{path} {emotion} ({probs[pred_id]*100:.2f}%)")
    return emotion

def main():
    model, extractor = load_model()

    raw_audio, sr = read_wave(AUDIO_FILE)
    speech_segments = vad_collector(raw_audio, sample_rate=sr)

    if not speech_segments:
        print("No speech detected.")
        return

    combined = b''.join(speech_segments)
    temp_path = "temp_segment.wav"
    save_temp_wav(combined, temp_path, sample_rate=sr)

    emotion = predict_emotion(model, extractor, temp_path)

    os.remove(temp_path)
    return emotion

if __name__ == "__main__":
    main()
