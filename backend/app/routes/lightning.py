from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.config import Settings, get_settings
from app.models.lightning import LightningSpeakRequest, LightningSpeakResponse
from app.services.lightning_service import speak_lightning, stream_lightning

router = APIRouter(prefix="/lightning", tags=["Lightning"])


@router.post("/speak", response_model=LightningSpeakResponse)
async def lightning_speak(payload: LightningSpeakRequest) -> LightningSpeakResponse:
    """Return parsed script output for compatibility/debug workflows."""
    return await speak_lightning(payload)


@router.post("/speak/stream")
async def lightning_speak_stream(
    payload: LightningSpeakRequest,
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    """Stream clean PCM audio bytes suitable for browser audio playback."""
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        stream_lightning(payload=payload, settings=settings),
        media_type="audio/pcm",
        headers=headers,
    )


@router.post("/stream")
async def lightning_stream(
    payload: LightningSpeakRequest,
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    """Alias endpoint for lightweight frontend tester integration."""
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        stream_lightning(payload=payload, settings=settings),
        media_type="audio/pcm",
        headers=headers,
    )
