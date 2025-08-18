from fastapi import APIRouter, Request
import numpy as np
import time

router = APIRouter()

def rule_based_fusion(modalities):
    # Always use all three modalities, treat missing as [0, 0]
    face = modalities.get('face', [0, 0])
    voice = modalities.get('voice', [0, 0])
    text = modalities.get('text', [0, 0])
    
    # Ensure we have valid arrays with at least 2 elements
    if not isinstance(face, list) or len(face) < 2:
        face = [0, 0]
    if not isinstance(voice, list) or len(voice) < 2:
        voice = [0, 0]
    if not isinstance(text, list) or len(text) < 2:
        text = [0, 0]
    
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