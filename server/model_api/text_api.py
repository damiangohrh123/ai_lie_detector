from fastapi import APIRouter, Request
import time
import logging
import os
import asyncio

router = APIRouter()

# Models will be stored here after initialization.
_state = {
    'tokenizer': None,
    'model': None,
    'device': None,
    'temperature': 1.2343440055847168,
    'init_lock': asyncio.Lock()
}

logger = logging.getLogger(__name__)

# Initialize model and tokenizer. Uses an async lock to ensure thread-safety.
async def init_text_model(app=None):
    # If already initialized, return immediately
    if _state['model'] is not None and _state['tokenizer'] is not None:
        return

    async with _state['init_lock']:
        # Double-check inside the lock
        if _state['model'] is not None and _state['tokenizer'] is not None:
            return
        try:
            # Import transformers and torch lazily to avoid import-time overhead for tests.
            from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification
            import torch

            model_repo = "damiangohrh123/deception-detector"

            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

            tokenizer = DistilBertTokenizerFast.from_pretrained(model_repo)
            model = DistilBertForSequenceClassification.from_pretrained(model_repo)
            model.to(device)
            model.eval()

            # limit threads
            try:
                max_threads = min(4, os.cpu_count() or 1)
                torch.set_num_threads(max_threads)
            except Exception:
                pass

            # Run a dummy input once to ensure first real request is not slow.
            try:
                warmup_inputs = tokenizer(
                    "warmup",
                    return_tensors="pt",
                    truncation=True,
                    padding=True,
                    max_length=8
                )
                warmup_inputs = {k: v.to(device) for k, v in warmup_inputs.items()}
                with torch.no_grad():
                    _ = model(**warmup_inputs).logits
            except Exception:
                logger.info("Text model warmup skipped or failed (non-fatal)")

            _state['tokenizer'] = tokenizer
            _state['model'] = model
            _state['device'] = device

            if app is not None:
                try:
                    app.state.text_model_loaded = True
                except Exception:
                    pass
            logger.info(f"Text model initialized on device={device}")
        except Exception as e:
            logger.exception("Failed to initialize text model: %s", e)


def _map_label(predicted_label: int):
    return "truthful" if int(predicted_label) == 0 else "deceptive"


@router.post("/api/text-sentiment")
async def text_sentiment(request: Request):
    start_time = time.time()

    # Ensure model initialized (lazy init)
    if _state['model'] is None or _state['tokenizer'] is None:
        # Try to initialize using app if available, otherwise initialize without app reference
        try:
            await init_text_model(getattr(request.app, 'state', None) or request.app)
        except Exception:
            # If init failed, return neutral response rather than raising
            return {
                "label": "NEUTRAL",
                "score": 0.0,
                "text": (await request.json()).get('text', '')
            }
        
    # Read the JSON and extract the text.
    data = await request.json()
    text = data.get("text", "")
    # If text is empty, return NEUTRAL sentiment
    if not text.strip():
        logger.info(
            f"Empty text received, returning NEUTRAL in {time.time() - start_time:.4f} seconds"
        )
        return {"label": "NEUTRAL", "score": 0.0, "text": text}

    try:
        import torch
        tokenizer = _state['tokenizer']
        model = _state['model']
        device = _state['device']
        temperature = _state.get('temperature', 1.0)

        # Max token length is 256.
        max_length = 256
        # Tokenize the input text.
        tokenize_start = time.time()
        inputs = tokenizer(
            text,
            return_tensors='pt',
            truncation=True,
            padding=True,
            max_length=max_length
        )
        # Move tensors to device (CPU or GPU).
        inputs = {k: v.to(device) for k, v in inputs.items()}
        tokenize_time = time.time() - tokenize_start
        # Get predictions.
        inference_start = time.time()
        with torch.no_grad():
            logits = model(**inputs).logits
            # Apply temperature calibration
            try:
                t = float(temperature)
                if t <= 0.0:
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
        logger.info(
            f"Text analysis completed - Text: '{text[:50]}{'...' if len(text) > 50 else ''}', "
            f"Total: {total_time:.4f}s (tokenize: {tokenize_time:.4f}s, inference: {inference_time:.4f}s) "
            f"device={device}"
        )

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
        logger.exception(f"Text sentiment analysis error in {error_time:.4f} seconds: {e}")
        return {"label": "NEUTRAL", "score": 0.0, "text": text, "error": str(e)}
