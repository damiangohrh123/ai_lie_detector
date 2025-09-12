from fastapi import APIRouter, Request

router = APIRouter()

def rule_based_fusion(modalities):
    # Consider only modalities that are provided in the request
    # Missing keys are treated as absent and excluded from normalization.
    keys = ['face', 'voice', 'text']

    # Extract scores (deceptive index = 1) for provided modalities
    scores_map = {}
    present_keys = []
    for k in keys:
        v = modalities.get(k)
        if isinstance(v, list) and len(v) > 1:
            try:
                scores_map[k] = float(v[1])
            except Exception:
                scores_map[k] = 0.0
            # Treat all-zero vector (e.g. [0,0]) as absent
            try:
                is_nonzero = any(float(x) != 0.0 for x in v)
            except Exception:
                is_nonzero = False
            if is_nonzero:
                present_keys.append(k)
        else:
            scores_map[k] = 0.0

    # Average overall score over present modalities
    if len(present_keys) > 0:
        avg_score = sum(scores_map[k] for k in present_keys) / len(present_keys)
        # Give an equal share to present modalities only
        equal_share = 1.0 / len(present_keys)
        contributions = {k: (equal_share if k in present_keys else 0.0) for k in keys}
    else:
        # If no present modalities, return JSON null for score and all contributions zero
        avg_score = None
        contributions = {k: 0.0 for k in keys}

    return {
        'score': avg_score,
        'used_modalities': ['face', 'voice', 'text'],
        'contributions': contributions
    }

@router.post("/api/fusion-truthfulness")
async def fusion_truthfulness(request: Request):
    data = await request.json()
    # Expecting: { 'face': [truth, lie], 'voice': [truth, lie], 'text': [truth, lie] }
    result = rule_based_fusion(data)
    return result