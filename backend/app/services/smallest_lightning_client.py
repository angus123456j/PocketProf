from __future__ import annotations

import base64
from dataclasses import dataclass
import json
import logging
import time
from typing import Any, AsyncIterator

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class LightningStreamMetrics:
    """Timing metadata captured during upstream stream lifecycle."""

    request_start_ts: float
    first_byte_ts: float | None = None
    ttfb_ms: float | None = None


class LightningClientError(Exception):
    """Typed error wrapper for upstream Lightning API failures."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class SmallestLightningClient:
    """Minimal client for smallest.ai Lightning v3.1 TTS streaming."""

    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float | None = None,
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._timeout = timeout or 30.0

    async def stream_tts(
        self,
        script_text: str,
        voice_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[AsyncIterator[bytes], LightningStreamMetrics]:
        """Create a streaming request and yield raw PCM chunks from Lightning."""
        metrics = LightningStreamMetrics(request_start_ts=time.perf_counter())
        api_key = (self._settings.SMALLEST_API_KEY or "").strip()
        if not api_key:
            raise LightningClientError("SMALLEST_API_KEY is empty after trimming whitespace")

        selected_voice = voice_id or "sophia"
        payload: dict[str, Any] = {
            "text": script_text,
            "model": self._settings.LIGHTNING_MODEL,
            "sample_rate": self._settings.LIGHTNING_SAMPLE_RATE,
            "output_format": self._settings.LIGHTNING_OUTPUT_FORMAT,
            "voice_id": selected_voice,
        }
        if metadata:
            payload["metadata"] = metadata

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        logger.info(
            "Lightning request prepared: url=%s, key_len=%s, has_voice_id=%s",
            self._settings.LIGHTNING_API_URL,
            len(api_key),
            bool(selected_voice),
        )

        async def iterator() -> AsyncIterator[bytes]:
            try:
                async with httpx.AsyncClient(
                    timeout=self._timeout, transport=self._transport
                ) as client:
                    async with client.stream(
                        "POST",
                        self._settings.LIGHTNING_API_URL,
                        json=payload,
                        headers=headers,
                    ) as response:
                        if response.status_code >= 400:
                            detail = (await response.aread()).decode("utf-8", errors="ignore")
                            raise LightningClientError(
                                f"Lightning API error ({response.status_code}): {detail}",
                                status_code=response.status_code,
                            )

                        content_type = response.headers.get("content-type", "").lower()
                        if "text/event-stream" in content_type:
                            async for chunk in self._iter_pcm_from_sse(response):
                                if metrics.first_byte_ts is None:
                                    metrics.first_byte_ts = time.perf_counter()
                                    metrics.ttfb_ms = (
                                        metrics.first_byte_ts - metrics.request_start_ts
                                    ) * 1000.0
                                yield chunk
                        else:
                            async for chunk in response.aiter_bytes():
                                if not chunk:
                                    continue
                                if metrics.first_byte_ts is None:
                                    metrics.first_byte_ts = time.perf_counter()
                                    metrics.ttfb_ms = (
                                        metrics.first_byte_ts - metrics.request_start_ts
                                    ) * 1000.0
                                yield chunk
            except httpx.TimeoutException as exc:
                raise LightningClientError("Lightning API request timed out") from exc
            except httpx.HTTPError as exc:
                raise LightningClientError(f"Lightning API request failed: {exc}") from exc

        return iterator(), metrics

    async def _iter_pcm_from_sse(self, response: httpx.Response) -> AsyncIterator[bytes]:
        """Parse upstream SSE frames and yield only decoded PCM bytes."""
        current_event = ""
        data_lines: list[str] = []

        async for line in response.aiter_lines():
            if line.startswith("event:"):
                current_event = line.split(":", 1)[1].strip()
                continue

            if line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
                continue

            if line.strip():
                continue

            if current_event == "audio" and data_lines:
                chunk = self._extract_audio_from_event_data("\n".join(data_lines))
                if chunk:
                    yield chunk

            current_event = ""
            data_lines = []

        if current_event == "audio" and data_lines:
            chunk = self._extract_audio_from_event_data("\n".join(data_lines))
            if chunk:
                yield chunk

    def _extract_audio_from_event_data(self, payload_text: str) -> bytes:
        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError:
            return b""

        if not isinstance(payload, dict):
            return b""

        audio_b64 = payload.get("audio")
        if not audio_b64 or not isinstance(audio_b64, str):
            return b""

        try:
            return base64.b64decode(audio_b64, validate=False)
        except Exception:
            return b""
