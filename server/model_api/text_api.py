from fastapi import APIRouter, Request
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification
import torch

router = APIRouter()

# Load the fine-tuned DistilBERT model from Hugging Face Hub
model_repo = "damiangohrh123/deception-detector"

# Load model and tokenizer from Hugging Face Hub
tokenizer = DistilBertTokenizerFast.from_pretrained(model_repo)
model = DistilBertForSequenceClassification.from_pretrained(model_repo)
model.eval()  # Set to evaluation mode

@router.post("/api/text-sentiment")
async def text_sentiment(request: Request):
    # Reads the JSON and extracts the text
    data = await request.json()
    text = data.get("text", "")

    # If text is empty, return NEUTRAL sentiment
    if not text.strip():
        return {"label": "NEUTRAL", "score": 0.0, "text": text}

    try:
        # Tokenize the input text
        inputs = tokenizer(text, return_tensors='pt', truncation=True, padding=True, max_length=128)
        
        # Get predictions
        with torch.no_grad():
            logits = model(**inputs).logits
            probs = torch.softmax(logits, dim=1)
        
        # Get the predicted label and confidence
        predicted_label = torch.argmax(probs, dim=1).item()
        confidence = float(probs[0][predicted_label])
        
        # Map to labels (0 = truthful, 1 = deceptive)
        label = "truthful" if predicted_label == 0 else "deceptive"
        
        return {
            "label": label, 
            "score": confidence, 
            "text": text,
            "model": "fine-tuned-distilbert-hf"
        }
        
    except Exception as e:
        print(f"Error in text sentiment analysis: {e}")
        return {"label": "NEUTRAL", "score": 0.0, "text": text, "error": str(e)} 