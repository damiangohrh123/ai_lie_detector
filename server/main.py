from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from model_api.voice_api import router as voice_router
from model_api.text_api import router as text_router
from model_api.fusion_api import router as fusion_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(voice_router)
app.include_router(text_router)
app.include_router(fusion_router) 