import asyncio
import base64
import logging
import time

import pytest

from app.config import Settings
from app.models.lightning import LightningSpeakRequest
from app.services.lightning_service import stream_lightning
from app.services.smallest_lightning_client import (
    LightningClientError,
    LightningStreamMetrics,
    SmallestLightningClient,
)
from app.utils.latex_parser import latex_to_teaching_script


@pytest.mark.asyncio
async def test_latex_parser_converts_math_and_extracts_anchors() -> None:
    source = (
        "A student asked about the radius: x^2 + y^2 = r^2. "
        "The prof's trick is to always check the units first. "
        "Also consider \\frac{a+b}{c} and \\sqrt{x}."
    )

    result = latex_to_teaching_script(source)

    assert "x squared plus y squared equals r squared" in result.text.lower()
    assert "a plus b over c" in result.text.lower()
    assert "square root of x" in result.text.lower()

    anchor_types = {anchor.anchor_type for anchor in result.anchors}
    assert "student_question" in anchor_types
    assert "prof_trick" in anchor_types
    assert "math_proof" in anchor_types


class _FakeSuccessClient:
    async def stream_tts(self, script_text: str, voice_id: str | None = None, metadata: dict | None = None):
        _ = script_text, voice_id, metadata
        metrics = LightningStreamMetrics(
            request_start_ts=time.perf_counter(),
            first_byte_ts=time.perf_counter(),
            ttfb_ms=12.34,
        )

        async def generator():
            for chunk in (b"\x01\x02\x03", b"\x04\x05\x06"):
                await asyncio.sleep(0)
                yield chunk

        return generator(), metrics


class _FakeErrorClient:
    async def stream_tts(self, script_text: str, voice_id: str | None = None, metadata: dict | None = None):
        _ = script_text, voice_id, metadata
        raise LightningClientError("upstream failed", status_code=500)


@pytest.mark.asyncio
async def test_stream_emits_raw_audio_and_logs_metrics(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="app.services.lightning_service")

    settings = Settings(SMALLEST_API_KEY="test-key")
    payload = LightningSpeakRequest(
        latex_summary="A student asked: x^2 + y^2 = r^2. The professor's trick is check units first."
    )

    chunks: list[bytes] = []
    async for chunk in stream_lightning(payload=payload, settings=settings, client=_FakeSuccessClient()):
        chunks.append(chunk)

    assert chunks == [b"\x01\x02\x03", b"\x04\x05\x06"]
    assert any("ttfb_ms" in rec.getMessage() for rec in caplog.records)


@pytest.mark.asyncio
async def test_stream_raises_on_upstream_failure() -> None:
    settings = Settings(SMALLEST_API_KEY="test-key")
    payload = LightningSpeakRequest(latex_summary="Core concept: \\sqrt{x}.")

    with pytest.raises(LightningClientError):
        async for _ in stream_lightning(payload=payload, settings=settings, client=_FakeErrorClient()):
            pass


def test_extract_audio_from_upstream_sse_event_data() -> None:
    settings = Settings(SMALLEST_API_KEY="test-key")
    client = SmallestLightningClient(settings=settings)

    pcm = b"\x01\x02\x03\x04"
    payload = {"audio": base64.b64encode(pcm).decode("ascii"), "done": False, "status": "206"}
    decoded = client._extract_audio_from_event_data(str(payload).replace("'", '"'))
    assert decoded == pcm

