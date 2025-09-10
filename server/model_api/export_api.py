from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from jinja2 import Environment, FileSystemLoader, select_autoescape
import asyncio
import tempfile
import os
import logging
import traceback
import sys
import re
from starlette.background import BackgroundTask

router = APIRouter()

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Note: Windows event-loop policy is set in server/asgi.py before the app imports
# so we avoid touching it here and keep this module focused on rendering.

# Use Playwright to render HTML to PDF for more robust cross-platform behavior.
async def _html_to_pdf(html: str, output_path: str):
    # Use Playwright's synchronous API inside a separate thread. This avoids
    # running Playwright's subprocess creation on the asyncio event loop which
    # can raise NotImplementedError on some Windows setups.
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        # Fail fast with a clear instruction to install Playwright and browsers
        raise RuntimeError(
            "playwright (sync API) is required: run `pip install playwright` and then `python -m playwright install` in the server venv") from e

    def render_sync():
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_content(html, wait_until='networkidle')
            # Save to PDF with print background and A4 format
            page.pdf(path=output_path, format='A4', print_background=True)
            browser.close()

    # Run blocking Playwright sync code in a thread so it doesn't block the event loop
    await asyncio.to_thread(render_sync)


@router.post("/api/export-summary")
async def export_summary(request: Request):
    """Accepts a JSON payload with session data and returns a rendered PDF summary.

    Expected JSON shape (example):
    {
      "session_id": "abc123",
      "timestamp": "2025-09-09T12:00:00Z",
      "fusion_score": 0.72,
      "modalities": {"face":0.6, "voice":0.8, "text":0.7},
      "timeline": [{"t":0.0, "score":0.1}, ...],
      "transcript": [{"start":1.2, "end":2.8, "text":"Hello"}, ...],
      "thumbnail_url": "https://.../thumb.png",
      "video_url": "https://.../session.mp4"
    }
    """
    data = await request.json()

    # Minimal validation
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Log a compact summary of the incoming request for debugging
    sid_raw = str(data.get('session_id', 'unknown') or 'unknown')
    safe_sid = re.sub(r'[^A-Za-z0-9_.-]', '_', sid_raw)[:128]
    logger.info("Export request received: session_id=%s safe=%s keys=%s", sid_raw, safe_sid, list(data.keys()))

    # Render Jinja2 template with session data
    templates_dir = os.path.join(os.path.dirname(__file__), 'templates')
    env = Environment(loader=FileSystemLoader(templates_dir), autoescape=select_autoescape(['html', 'xml']))
    tpl = env.get_template('summary.html')
    try:
        html = tpl.render(session=data)
    except Exception as e:
        tb = traceback.format_exc()
        logger.exception("Template rendering failed for session %s", safe_sid)
        return _error_response("template_render_failed", str(e), tb)

    # Create a unique temporary file for the PDF using NamedTemporaryFile
    tmpdir = tempfile.gettempdir()
    try:
        tmpf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf', prefix=f"session_summary_{safe_sid}_", dir=tmpdir)
        out_path = tmpf.name
        tmpf.close()
    except Exception as e:
        tb = traceback.format_exc()
        logger.exception("Failed to create temporary file for session %s", safe_sid)
        return _error_response("tempfile_create_failed", str(e), tb)

    logger.info("Rendering PDF for session %s -> %s", safe_sid, out_path)

    try:
        await _html_to_pdf(html, out_path)
        # Return the file and schedule deletion after send
        filename = f"summary_{safe_sid}.pdf"
        logger.info("PDF render succeeded for session %s, returning %s", safe_sid, out_path)
        return FileResponse(out_path, filename=filename, media_type='application/pdf', background=BackgroundTask(lambda p=out_path: _safe_remove(p)))
    except Exception as e:
        tb = traceback.format_exc()
        logger.exception("Failed to render PDF for session %s: %s", safe_sid, str(e))
        # Attempt to remove the temp file if it exists
        try:
            if os.path.exists(out_path):
                os.remove(out_path)
                logger.debug("Removed temporary file %s after failure", out_path)
        except Exception:
            logger.exception("Failed to remove temporary file %s", out_path)
        # Surface error to stderr for developers
        try:
            sys.stderr.write(f"PDF RENDER ERROR session={safe_sid} path={out_path}\n")
            sys.stderr.write(tb + "\n")
            sys.stderr.flush()
        except Exception:
            pass

        msg = str(e)
        if 'playwright is required' in msg:
            detail = msg + "; ensure Playwright is installed and run `python -m playwright install`"
            return _error_response("playwright_unavailable", detail, tb)

        return _error_response("PDF rendering failed", msg, tb)


def _safe_remove(path: str) -> None:
    """Helper to remove a file and log any failures (used by BackgroundTask)."""
    try:
        if os.path.exists(path):
            os.remove(path)
            logger.info("Temporary file removed: %s", path)
    except Exception:
        logger.exception("Failed to remove temporary file: %s", path)


def _error_response(error_key: str, detail: str, tb: str, status: int = 500):
    """Centralized error response that logs and writes traceback to stderr."""
    try:
        sys.stderr.write(f"{error_key}: {detail}\n")
        sys.stderr.write(tb + "\n")
        sys.stderr.flush()
    except Exception:
        pass
    return JSONResponse(status_code=status, content={"error": error_key, "detail": detail, "traceback": tb})
