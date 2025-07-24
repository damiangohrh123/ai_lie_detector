from fastapi import APIRouter, Request
from transformers import pipeline

router = APIRouter()

# Load the zero-shot classification pipeline once at startup
zero_shot_pipeline = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")

@router.post("/api/text-sentiment")
async def text_sentiment(request: Request):
    # Reads the JSON and extracts the text
    data = await request.json()
    text = data.get("text", "")

    # If text is empty, return NEUTRAL sentiment
    if not text.strip():
        return {"label": "NEUTRAL", "score": 0.0, "text": text}

    # Run the zero-shot classification pipeline, with "truthful" and "deceptive" as candidate labels
    result = zero_shot_pipeline(
        text,
        candidate_labels=["truthful", "deceptive"]
    )
    
    # Get the top label and its score
    label = result["labels"][0]
    score = float(result["scores"][0])
    return {"label": label, "score": score, "text": text} 