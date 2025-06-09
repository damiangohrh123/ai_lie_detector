import sys
import io
import torch
import librosa
import numpy as np
import webrtcvad
import collections
from pydub import AudioSegment
from transformers import Wav2Vec2ForSequenceClassification, AutoFeatureExtractor

# Load emotion recognition model and feature extractor
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = Wav2Vec2ForSequenceClassification.from_pretrained("superb/wav2vec2-base-superb-er").to(device)
feature_extractor = AutoFeatureExtractor.from_pretrained("superb/wav2vec2-base-superb-er")

EMOTION_LABELS = [
    "angry", "calm", "disgust", "fearful", "happy", "neutral", "sad", "surprised"
]

# Frame class for VAD
class Frame:
    def __init__(self, bytes, timestamp, duration):
        self.bytes = bytes
        self.timestamp = timestamp
        self.duration = duration

def frame_generator(frame_duration_ms, audio, sample_rate):
    n = int(sample_rate * frame_duration_ms / 1000.0) * 2
    offset = 0
    timestamp = 0.0
    duration = float(n) / sample_rate / 2.0
    while offset + n <= len(audio):
        yield Frame(audio[offset:offset + n], timestamp, duration)
        timestamp += duration
        offset += n

def vad_collector(sample_rate, frame_duration_ms, padding_duration_ms, vad, frames):
    num_padding_frames = int(padding_duration_ms / frame_duration_ms)
    ring_buffer = collections.deque(maxlen=num_padding_frames)
    triggered = False
    voiced_frames = []
    segments = []

    for frame in frames:
        is_speech = vad.is_speech(frame.bytes, sample_rate)

        if not triggered:
            ring_buffer.append((frame, is_speech))
            num_voiced = len([f for f, speech in ring_buffer if speech])
            if num_voiced > 0.9 * ring_buffer.maxlen:
                triggered = True
                voiced_frames.extend([f for f, s in ring_buffer])
                ring_buffer.clear()
        else:
            voiced_frames.append(frame)
            ring_buffer.append((frame, is_speech))
            num_unvoiced = len([f for f, speech in ring_buffer if not speech])
            if num_unvoiced > 0.9 * ring_buffer.maxlen:
                triggered = False
                segment = b''.join([f.bytes for f in voiced_frames])
                segments.append(segment)
                ring_buffer.clear()
                voiced_frames = []

    if voiced_frames:
        segment = b''.join([f.bytes for f in voiced_frames])
        segments.append(segment)

    return segments

def analyze_emotion(waveform, sr):
    inputs = feature_extractor(waveform.squeeze().numpy(), sampling_rate=sr, return_tensors="pt", padding=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        logits = model(**inputs).logits
    predicted_id = torch.argmax(logits, dim=-1).item()
    return EMOTION_LABELS[predicted_id]

def main(audio_path):
    # Load audio and convert to 16kHz mono
    audio = AudioSegment.from_file(audio_path)
    audio = audio.set_channels(1).set_frame_rate(16000)
    raw_audio = audio.raw_data
    sample_rate = 16000

    vad = webrtcvad.Vad(2)
    frames = frame_generator(30, raw_audio, sample_rate)
    frames = list(frames)
    segments = vad_collector(sample_rate, 30, 300, vad, frames)

    print(f"Detected {len(segments)} speech segment(s).")

    results = []
    for i, segment in enumerate(segments):
        audio_segment = np.frombuffer(segment, dtype=np.int16).astype(np.float32) / 32768.0
        emotion = analyze_emotion(torch.tensor(audio_segment).unsqueeze(0), sample_rate)
        print(f"Segment {i+1}: {emotion}")
        results.append(emotion)

    return results

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python voice_analysis.py <path_to_audio_file>")
        sys.exit(1)

    audio_path = sys.argv[1]
    main(audio_path)
