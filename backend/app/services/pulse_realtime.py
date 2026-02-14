import json
import logging

import websockets

from app.config import get_settings

logger = logging.getLogger(__name__)

PULSE_WS_URL = "wss://waves-api.smallest.ai/api/v1/pulse/get_text"


async def create_pulse_connection():
    """Create a WebSocket connection to Smallest Pulse real-time API."""
    settings = get_settings()
    params = "language=en&encoding=linear16&sample_rate=16000"
    url = f"{PULSE_WS_URL}?{params}"
    return await websockets.connect(
        url,
        additional_headers={"Authorization": f"Bearer {settings.SMALLEST_API_KEY}"},
        ping_interval=20,
        ping_timeout=20,
    )
