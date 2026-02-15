from pydantic import BaseModel


class ServiceResponse(BaseModel):
    """Standard response returned by service endpoints."""

    message: str


class HealthResponse(BaseModel):
    """Response model for the health check endpoint."""

    status: str
    environment: str
    service: str


class PulseTranscriptionResponse(BaseModel):
    """Response from Pulse batch transcription."""

    transcription: str


class PulseTranscriptionLatexResponse(BaseModel):
    """Response from Pulse transcription with LaTeX formatting."""

    latex: str


class ParseRequest(BaseModel):
    """Request body for parse endpoint."""

    text: str


class ParseResponse(BaseModel):
    """Response from parse endpoint."""

    formatted: str


class AskRequest(BaseModel):
    """Request body for ask (Q&A) endpoint."""

    question: str
    context: str | None = None


class AskResponse(BaseModel):
    """Response from ask endpoint."""

    answer: str


class SlideContext(BaseModel):
    """Context for a single slide."""
    slide_number: int
    description: str
    text_content: str


class SlideAnalysisRequest(BaseModel):
    """Request to analyze slides."""
    images: list[str]  # Base64 encoded images


class SlideChatRequest(BaseModel):
    """Request to chat with slides."""
    query: str
    context: list[SlideContext]
    current_slide: int
    history: list[dict] = []


class SlideChatResponse(BaseModel):
    """Response from slide chat."""
    answer: str
    suggested_slide: int | None = None


class ScriptAlignmentRequest(BaseModel):
    """Request to align script with slides."""
    script: str
    context: list[SlideContext]


class ScriptAlignmentResponse(BaseModel):
    """Response from script alignment."""
    segments: list[dict]  # [{"text": "...", "slide_number": 1}, ...]
