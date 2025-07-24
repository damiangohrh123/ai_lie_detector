from fastapi import APIRouter, Request
import numpy as np

router = APIRouter()

def rule_based_fusion(modalities):
    # Always use all three modalities, treat missing as [0, 0]
    face = modalities.get('face') or [0, 0]
    voice = modalities.get('voice') or [0, 0]
    text = modalities.get('text') or [0, 0]
    # Use the 'deceptive' score (index 1)
    scores = [face[1], voice[1], text[1]]
    avg_score = sum(scores) / 3
    return {'score': avg_score, 'used_modalities': ['face', 'voice', 'text']}

@router.post("/api/fusion-truthfulness")
async def fusion_truthfulness(request: Request):
    data = await request.json()
    # Expecting: { 'face': [truth, lie], 'voice': [truth, lie], 'text': [truth, lie] }
    result = rule_based_fusion(data)
    return result 