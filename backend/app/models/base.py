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
