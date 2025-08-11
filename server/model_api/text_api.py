from fastapi import APIRouter, Request
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification
import torch
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Load the fine-tuned DistilBERT model from Hugging Face Hub
model_repo = "damiangohrh123/deception-detector"

# Load model and tokenizer from Hugging Face Hub
tokenizer = DistilBertTokenizerFast.from_pretrained(model_repo)
model = DistilBertForSequenceClassification.from_pretrained(model_repo)
model.eval()  # Set to evaluation mode

@router.post("/api/text-sentiment")
async def text_sentiment(request: Request):
    start_time = time.time()
    
    # Reads the JSON and extracts the text
    data = await request.json()
    text = data.get("text", "")

    # If text is empty, return NEUTRAL sentiment
    if not text.strip():
        logger.info(f"Empty text received, returning NEUTRAL in {time.time() - start_time:.4f} seconds")
        return {"label": "NEUTRAL", "score": 0.0, "text": text}

    try:
        # Tokenize the input text
        tokenize_start = time.time()
        inputs = tokenizer(text, return_tensors='pt', truncation=True, padding=True, max_length=128)
        tokenize_time = time.time() - tokenize_start
        
        # Get predictions
        inference_start = time.time()
        with torch.no_grad():
            logits = model(**inputs).logits
            probs = torch.softmax(logits, dim=1)
        inference_time = time.time() - inference_start
        
        # Get the predicted label and confidence
        predicted_label = torch.argmax(probs, dim=1).item()
        confidence = float(probs[0][predicted_label])
        
        # Map to labels (0 = truthful, 1 = deceptive)
        label = "truthful" if predicted_label == 0 else "deceptive"
        
        total_time = time.time() - start_time
        logger.info(f"Text analysis completed - Text: '{text[:50]}{'...' if len(text) > 50 else ''}', Label: {label}, Confidence: {confidence:.4f}, Tokenization: {tokenize_time:.4f}s, Inference: {inference_time:.4f}s, Total: {total_time:.4f}s")
        
        return {
            "label": label, 
            "score": confidence, 
            "text": text,
            "model": "fine-tuned-distilbert-hf"
        }
        
    except Exception as e:
        error_time = time.time() - start_time
        logger.error(f"Text sentiment analysis error in {error_time:.4f} seconds: {e}")
        return {"label": "NEUTRAL", "score": 0.0, "text": text, "error": str(e)} 