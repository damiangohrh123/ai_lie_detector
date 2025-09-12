import sys
import asyncio
import logging

# Windows the Proactor event loop policy
try:
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers]
from model_api import voice_api as voice_api_module
from model_api import text_api as text_api_module
from model_api.voice_api import router as voice_router
from model_api.text_api import router as text_router
from model_api.fusion_api import router as fusion_router
from model_api.export_api import router as export_router

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

@app.on_event("startup")
async def startup_event():
    """Initialize heavy models on startup in background threads to avoid blocking the event loop. We try to initialize voice and text models."""
    async def _init_text():
        try:
            await text_api_module.init_text_model(app)
        except Exception as e:
            logging.getLogger(__name__).warning(f"Text model initialization failed on startup: {e}")

    async def _init_voice():
        try:
            await voice_api_module.init_voice_models(app)
        except Exception as e:
            logging.getLogger(__name__).warning(f"Voice model initialization failed on startup: {e}")

    await asyncio.gather(_init_text(), _init_voice())