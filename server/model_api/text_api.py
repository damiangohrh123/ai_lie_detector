from fastapi import APIRouter, Request

router = APIRouter()

@router.post("/api/text-sentiment")
async def text_sentiment(request: Request):
    data = await request.json()
    text = data.get("text", "")
    # Placeholder: always return neutral
    return {"label": "NEUTRAL", "score": 0.5, "text": text} 