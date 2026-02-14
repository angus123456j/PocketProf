import httpx
from fastapi import APIRouter, HTTPException

from app.models.base import ParseRequest, ParseResponse
from app.services.parse_service import parse_transcript

router = APIRouter(prefix="/parse", tags=["Parse"])


@router.post("", response_model=ParseResponse)
async def parse(payload: ParseRequest) -> ParseResponse:
    """Format raw transcript into a polished lecture using Gemini."""
    if not payload.text or not payload.text.strip():
        raise HTTPException(400, "Text cannot be empty")
    try:
        formatted = await parse_transcript(payload.text)
        return ParseResponse(formatted=formatted)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(
                429,
                "Rate limit exceeded. Try again in a few minutes or check your Gemini API quota.",
            )
        raise HTTPException(502, f"Gemini API error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(500, str(e))
