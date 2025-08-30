from pathlib import Path
import argparse
import csv
import time
import sys
import torch
from transformers import pipeline

DEFAULT_MODELS = [
    "superb/wav2vec2-base-superb-er",
    "superb/wav2vec2-large-superb-er",
    "superb/hubert-large-superb-er",
]

def find_audio_files(root: Path):
    exts = {".wav", ".flac", ".mp3", ".m4a", ".ogg"}
    if not root.exists():
        return []
    return [p for p in sorted(root.iterdir()) if p.suffix.lower() in exts]

def load_model(model_id: str, device: torch.device):
    use_device = 0 if (device.type == "cuda") else -1
    return pipeline("audio-classification", model=model_id, device=use_device)

def infer(pipeline_obj, audio_path: str, sr: int, device: torch.device):
    t0 = time.time()
    preds = pipeline_obj(audio_path, top_k=1)
    latency = time.time() - t0
    if not preds:
        return "", 0.0, latency
    top = preds[0]
    # pipeline returns {'label': 'LABEL', 'score': 0.123}
    label = top.get("label", "")
    score = float(top.get("score", 0.0))
    return label, score, latency

def main(argv=None):
    parser = argparse.ArgumentParser(description="Benchmark a few SUPERB emotion models on ./audio")
    parser.add_argument("--models", "-m", type=str, default=",".join(DEFAULT_MODELS), help="Comma-separated model IDs")
    parser.add_argument("--output", "-o", type=str, default=str(Path(__file__).resolve().parent / "results.csv"), help="CSV output")
    parser.add_argument("--sr", type=int, default=16000, help="Sample rate to load audio")
    args = parser.parse_args(argv)

    audio_dir = Path(__file__).resolve().parent / "audio"
    files = find_audio_files(audio_dir)
    if not files:
        print(f"No audio files in {audio_dir}", file=sys.stderr)
        return 2

    model_ids = [m.strip() for m in args.models.split(",") if m.strip()]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    results = []
    for mid in model_ids:
        print("Loading", mid)
        try:
            pipe = load_model(mid, device)
        except Exception as e:
            print(f"Failed to load {mid}: {e}", file=sys.stderr)
            continue

        for p in files:
            print(f"{mid} -> {p.name}")
            try:
                label, score, latency = infer(pipe, str(p), sr=args.sr, device=device)
            except Exception as e:
                print(f"Error processing {p}: {e}", file=sys.stderr)
                label, score, latency = "", 0.0, 0.0
            results.append({
                "model": mid,
                "audio": p.name,
                "predicted_label": label,
                "confidence": score,
                "latency_s": latency,
            })

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["model", "audio", "predicted_label", "confidence", "latency_s"])
        writer.writeheader()
        writer.writerows(results)
    print("Wrote", out_path)

if __name__ == "__main__":
    raise SystemExit(main())
