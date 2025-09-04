from fastapi import APIRouter, Request
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification
import torch
import time
import logging
import os

# Configure logging.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Disable logging
logging.disable(logging.CRITICAL)

router = APIRouter()

# Load the fine-tuned DistilBERT model from Hugging Face Hub.
model_repo = "damiangohrh123/deception-detector"

# Select GPU if available, else select CPU.
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load model and tokenizer from Hugging Face Hub.
tokenizer = DistilBertTokenizerFast.from_pretrained(model_repo)
model = DistilBertForSequenceClassification.from_pretrained(model_repo)
model.to(device)
model.eval()  # Set to evaluation mode.

# Limit PyTorch threads for more consistent latency and avoid thread startup overhead.
try:
    max_threads = min(4, os.cpu_count() or 1)
    torch.set_num_threads(max_threads)
    logger.info(f"Set torch num threads = {max_threads}")
except Exception:
    pass

# Run a dummy input once to ensure first real request is not slow.
try:
    warmup_inputs = tokenizer("warmup", return_tensors="pt", truncation=True, padding=True, max_length=8)
    warmup_inputs = {k: v.to(device) for k, v in warmup_inputs.items()}
    with torch.no_grad():
        t0 = time.time()
        _ = model(**warmup_inputs).logits
        t_elapsed = time.time() - t0
    logger.info(f"Model warmup completed in {t_elapsed:.4f}s")
except Exception as e:
    logger.warning(f"Model warmup failed: {e}")

# Temperature calibration. Temperature value is gotten from HuggingFace repo.
temperature = 1.2343440055847168

logger.info(f"Text model loaded on device={device}, temperature={temperature}")

def _map_label(predicted_label: int):
    return "truthful" if int(predicted_label) == 0 else "deceptive"

@router.post("/api/text-sentiment")
async def text_sentiment(request: Request):
    start_time = time.time()

    # Read the JSON and extract the text.
    data = await request.json()
    text = data.get("text", "")

    # If text is empty, return NEUTRAL sentiment
    if not text.strip():
        # log empty input
        logger.info(f"Empty text received, returning NEUTRAL in {time.time() - start_time:.4f} seconds")
        return {"label": "NEUTRAL", "score": 0.0, "text": text}

    try:
        # Max token length is 256.
        max_length = 256

        # Tokenize the input text.
        tokenize_start = time.time()
        inputs = tokenizer(text, return_tensors='pt', truncation=True, padding=True, max_length=max_length)
        # Move tensors to device (CPU or GPU).
        inputs = {k: v.to(device) for k, v in inputs.items()}
        tokenize_time = time.time() - tokenize_start

        # Get predictions.
        inference_start = time.time()
        with torch.no_grad():
            logits = model(**inputs).logits
            # Apply temperature calibration (always divide by temperature, safe-guard zero/invalid)
            try:
                t = float(temperature)
                if t <= 0.0 or not torch.isfinite(torch.tensor(t)):
                    logger.warning(f"Invalid temperature={temperature}; falling back to 1.0")
                    t = 1.0
            except Exception:
                t = 1.0
            calibrated = logits / float(t)
            probs = torch.softmax(calibrated, dim=1)
        inference_time = time.time() - inference_start

        # Get the predicted label and confidence
        predicted_label = int(torch.argmax(probs, dim=1).item())
        confidence = float(probs[0][predicted_label])

        # Map to labels using config when possible
        label = _map_label(predicted_label)

        total_time = time.time() - start_time
        # log timing, device and temperature
        logger.info(f"Text analysis completed - Text: '{text[:50]}{'...' if len(text) > 50 else ''}', Total: {total_time:.4f}s (tokenize: {tokenize_time:.4f}s, inference: {inference_time:.4f}s) device={device} temperature={temperature}")

        return {
            "label": label,
            "score": confidence,
            "text": text,
            "model": "fine-tuned-distilbert-hf",
            "device": str(device),
            "temperature": float(temperature)
        }

    except Exception as e:
        error_time = time.time() - start_time
        logger.error(f"Text sentiment analysis error in {error_time:.4f} seconds: {e}")
        return {"label": "NEUTRAL", "score": 0.0, "text": text, "error": str(e)}
