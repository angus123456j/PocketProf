from __future__ import annotations

import logging
import time
from typing import Any, AsyncIterator

from app.config import Settings
from app.models.lightning import LightningSpeakRequest, LightningSpeakResponse, SemanticAnchor
from app.services.smallest_lightning_client import (
    LightningClientError,
    SmallestLightningClient,
)
from app.utils.latex_parser import latex_to_teaching_script

logger = logging.getLogger(__name__)


async def speak_lightning(payload: LightningSpeakRequest) -> LightningSpeakResponse:
    """Return a parsed script preview for compatibility/debug workflows."""
    teaching_script = latex_to_teaching_script(payload.latex_summary)
    return LightningSpeakResponse(
        message="Lightning speech pipeline prepared",
        teaching_script_preview=teaching_script.text,
        anchors=teaching_script.anchors,
    )


async def stream_lightning(
    payload: LightningSpeakRequest,
    settings: Settings,
    client: SmallestLightningClient | None = None,
) -> AsyncIterator[bytes]:
    """Stream clean raw PCM bytes for browser playback."""
    parse_start = time.perf_counter()
    teaching_script = latex_to_teaching_script(payload.latex_summary)
    parse_ms = (time.perf_counter() - parse_start) * 1000.0

    if client is None:
        client = SmallestLightningClient(settings)

    estimated_duration_s = _estimate_speech_duration_seconds(teaching_script.text)
    total_chars = max(len(teaching_script.text), 1)

    anchors = teaching_script.anchors if payload.anchors_enabled else []
    sorted_anchors = sorted(anchors, key=lambda item: item.span_end)

    stream_started = time.perf_counter()
    bytes_streamed = 0
    anchor_index = 0

    try:
        chunk_iterator, metrics = await client.stream_tts(
            script_text=teaching_script.text,
            voice_id=payload.voice_id,
            metadata=payload.metadata,
        )

        async for chunk in chunk_iterator:
            bytes_streamed += len(chunk)

            progress = _estimate_progress_by_audio(
                bytes_streamed=bytes_streamed,
                sample_rate=settings.LIGHTNING_SAMPLE_RATE,
                estimated_duration_seconds=estimated_duration_s,
            )

            while anchor_index < len(sorted_anchors):
                candidate = sorted_anchors[anchor_index]
                threshold = candidate.span_end / total_chars
                if progress < threshold:
                    break
                logger.info("Semantic anchor reached: %s", _anchor_payload(candidate, estimated_duration_s, total_chars))
                anchor_index += 1

            yield chunk

        while anchor_index < len(sorted_anchors):
            logger.info(
                "Semantic anchor reached (end flush): %s",
                _anchor_payload(sorted_anchors[anchor_index], estimated_duration_s, total_chars),
            )
            anchor_index += 1

        total_stream_ms = (time.perf_counter() - stream_started) * 1000.0
        done_payload = {
            "total_bytes": bytes_streamed,
            "parse_ms": round(parse_ms, 2),
            "ttfb_ms": round(metrics.ttfb_ms, 2) if metrics.ttfb_ms is not None else None,
            "stream_ms": round(total_stream_ms, 2),
            "sample_rate": settings.LIGHTNING_SAMPLE_RATE,
            "output_format": settings.LIGHTNING_OUTPUT_FORMAT,
            "script_length": len(teaching_script.text),
        }
        logger.info("Lightning stream complete: %s", done_payload)

    except LightningClientError as exc:
        logger.exception("Lightning stream failed")
        raise
    except Exception as exc:  # pragma: no cover - final catch for stream stability
        logger.exception("Unexpected Lightning stream failure")
        raise RuntimeError(f"Unexpected error: {exc}") from exc


def _estimate_speech_duration_seconds(text: str) -> float:
    words = max(len(text.split()), 1)
    words_per_second = 2.6
    return max(words / words_per_second, 1.0)


def _estimate_progress_by_audio(
    bytes_streamed: int, sample_rate: int, estimated_duration_seconds: float
) -> float:
    bytes_per_second = max(sample_rate * 2, 1)
    elapsed_audio_seconds = bytes_streamed / bytes_per_second
    return min(1.0, elapsed_audio_seconds / max(estimated_duration_seconds, 0.001))


def _anchor_payload(anchor: SemanticAnchor, estimated_duration_s: float, total_chars: int) -> dict[str, Any]:
    ratio = anchor.span_end / max(total_chars, 1)
    return {
        "anchor_id": anchor.anchor_id,
        "anchor_type": anchor.anchor_type,
        "label": anchor.label,
        "text": anchor.text,
        "relative_ms": int(ratio * estimated_duration_s * 1000),
    }
