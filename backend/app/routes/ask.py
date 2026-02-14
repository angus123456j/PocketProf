import httpx
from fastapi import APIRouter, HTTPException

from app.models.base import AskRequest, AskResponse
from app.services.ask_service import answer_question

router = APIRouter(prefix="/ask", tags=["Ask"])


@router.post("", response_model=AskResponse)
async def ask(payload: AskRequest) -> AskResponse:
    """Answer the student's question using Gemini, with optional lesson context."""
    if not payload.question or not payload.question.strip():
        raise HTTPException(400, "Question cannot be empty")
    try:
        answer = await answer_question(
            question=payload.question,
            context=payload.context,
        )
        return AskResponse(answer=answer)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(
                429,
                "Rate limit exceeded. Try again in a few minutes or check your Gemini API quota.",
            )
        raise HTTPException(502, f"Gemini API error: {e.response.status_code}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))
