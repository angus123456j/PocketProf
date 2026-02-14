import json
import logging

from fastapi import APIRouter, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect

from app.models.base import (
    PulseTranscriptionLatexResponse,
    PulseTranscriptionResponse,
    ServiceResponse,
)
from app.services.pulse_realtime import create_pulse_connection
from app.services.pulse_service import stream_pulse, transcribe_audio, transcribe_to_latex

router = APIRouter(prefix="/pulse", tags=["Pulse"])
log = logging.getLogger(__name__)


@router.post("/stream", response_model=ServiceResponse)
async def pulse_stream(payload: dict) -> ServiceResponse:
    """Stream audio through the Pulse pipeline."""
    return await stream_pulse(payload)


@router.websocket("/live")
async def pulse_live(websocket: WebSocket) -> None:
    """Proxy WebSocket to Pulse real-time STT. Client sends binary audio chunks, receives transcript JSON."""
    await websocket.accept()
    try:
        pulse_ws = await create_pulse_connection()
    except Exception as e:
        log.exception("Failed to connect to Pulse")
        await websocket.close(code=1011, reason=str(e))
        return

    import asyncio

    client_done = asyncio.Event()

    async def forward_client_to_pulse():
        try:
            while True:
                msg = await websocket.receive()
                if "bytes" in msg:
                    await pulse_ws.send(msg["bytes"])
                elif "text" in msg:
                    try:
                        obj = json.loads(msg["text"])
                        if obj.get("type") == "end":
                            await pulse_ws.send(json.dumps({"type": "end"}))
                            client_done.set()
                            return
                    except (json.JSONDecodeError, TypeError):
                        pass
        except WebSocketDisconnect:
            client_done.set()

    async def forward_pulse_to_client():
        try:
            async for raw in pulse_ws:
                await websocket.send_text(raw)
                try:
                    obj = json.loads(raw)
                    if obj.get("is_last"):
                        break
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            log.exception("Error forwarding from Pulse: %s", e)
        finally:
            await pulse_ws.close()
            client_done.set()

    await asyncio.gather(forward_client_to_pulse(), forward_pulse_to_client())


@router.post("/transcribe", response_model=PulseTranscriptionResponse)
async def pulse_transcribe(audio: UploadFile = File(...)) -> PulseTranscriptionResponse:
    """Transcribe pre-recorded audio via Pulse batch API."""
    content_type = audio.content_type or "audio/webm"
    if not content_type.startswith("audio/"):
        raise HTTPException(400, "File must be audio (e.g. audio/webm, audio/wav)")
    content = await audio.read()
    if not content:
        raise HTTPException(400, "Empty audio file")
    return await transcribe_audio(content, content_type)


@router.post("/transcribe-latex", response_model=PulseTranscriptionLatexResponse)
async def pulse_transcribe_latex(audio: UploadFile = File(...)) -> PulseTranscriptionLatexResponse:
    """Transcribe audio via Pulse and return as a LaTeX document."""
    content_type = audio.content_type or "audio/mpeg"
    if not content_type.startswith("audio/"):
        raise HTTPException(400, "File must be audio (e.g. audio/mpeg, audio/webm)")
    content = await audio.read()
    if not content:
        raise HTTPException(400, "Empty audio file")
    return await transcribe_to_latex(content, content_type)
