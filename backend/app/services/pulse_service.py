import httpx

from app.config import get_settings
from app.models.base import PulseTranscriptionResponse, ServiceResponse

PULSE_URL = "https://waves-api.smallest.ai/api/v1/pulse/get_text"


async def stream_pulse(payload: dict) -> ServiceResponse:
    """Process a pulse streaming request."""
    return ServiceResponse(message="Pulse endpoint ready")


async def transcribe_audio(audio_bytes: bytes, content_type: str) -> PulseTranscriptionResponse:
    """Send audio to Smallest Pulse API and return transcription."""
    content_type = content_type or "audio/webm"
    settings = get_settings()
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            PULSE_URL,
            params={"model": "pulse", "language": "en"},
            headers={
                "Authorization": f"Bearer {settings.SMALLEST_API_KEY}",
                "Content-Type": content_type,
            },
            content=audio_bytes,
        )
        response.raise_for_status()
        data = response.json()
    transcription = data.get("transcription", "")
    return PulseTranscriptionResponse(transcription=transcription)


def _escape_latex(text: str) -> str:
    """Escape special LaTeX characters in plain text."""
    replacements = [
        ("\\", "\\textbackslash{}"),
        ("{", "\\{"),
        ("}", "\\}"),
        ("$", "\\$"),
        ("&", "\\&"),
        ("#", "\\#"),
        ("_", "\\_"),
        ("%", "\\%"),
        ("^", "\\^{}"),
        ("~", "\\textasciitilde{}"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


async def transcribe_to_latex(audio_bytes: bytes, content_type: str) -> "PulseTranscriptionLatexResponse":
    """Transcribe audio via Pulse and return as a LaTeX document."""
    from app.models.base import PulseTranscriptionLatexResponse

    result = await transcribe_audio(audio_bytes, content_type)
    escaped = _escape_latex(result.transcription)
    paragraphs = [p.strip() for p in escaped.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [escaped] if escaped else [""]
    body = "\n\n".join(f"{p}" for p in paragraphs)
    latex = f"""\\documentclass{{article}}
\\usepackage[utf8]{{inputenc}}
\\begin{{document}}

{body}

\\end{{document}}
"""
    return PulseTranscriptionLatexResponse(latex=latex)
