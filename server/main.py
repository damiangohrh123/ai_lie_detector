import sys
import asyncio

# Windows the Proactor event loop policy
try:
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from model_api.voice_api import router as voice_router
from model_api.text_api import router as text_router
from model_api.fusion_api import router as fusion_router
from model_api.export_api import router as export_router
import logging

# Disable uvicorn access logs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("uvicorn").setLevel(logging.WARNING)

# Disable httpx HTTP request logs
logging.getLogger("httpx").setLevel(logging.WARNING)

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
app.include_router(export_router)