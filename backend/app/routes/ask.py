import httpx
from fastapi import APIRouter, HTTPException

from app.models.base import AskRequest, AskResponse, SlideAnalysisRequest, SlideContext, SlideChatRequest, SlideChatResponse, ScriptAlignmentRequest, ScriptAlignmentResponse
from app.services.ask_service import answer_question, analyze_slides, chat_with_slides, align_script_with_slides

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


@router.post("/analyze", response_model=list[SlideContext])
async def analyze_endpoint(payload: SlideAnalysisRequest):
    """
    Analyze uploaded slides using Gemini Vision.
    """
    if not payload.images:
        raise HTTPException(status_code=400, detail="No images provided")
    
    try:
        results = await analyze_slides(payload.images)
        return results
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="Gemini API rate limit exceeded. Your PDF might be too large or you're sending too many requests."
            )
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/slides", response_model=SlideChatResponse)
async def chat_endpoint(payload: SlideChatRequest):
    """
    Chat with the slide context.
    """
    try:
        result = await chat_with_slides(
            payload.query, 
            payload.context, 
            payload.current_slide,
            payload.history
        )
        return SlideChatResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/align", response_model=ScriptAlignmentResponse)
async def align_endpoint(payload: ScriptAlignmentRequest):
    """
    Align a script with slides for synchronized playback.
    """
    try:
        segments = await align_script_with_slides(payload.script, payload.context)
        return ScriptAlignmentResponse(segments=segments)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
