from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AnchorType = Literal["concept", "student_question", "prof_trick", "math_proof"]


class SemanticAnchor(BaseModel):
    """Semantic marker that can be used to sync content state with audio."""

    anchor_id: str
    anchor_type: AnchorType
    span_start: int
    span_end: int
    label: str
    text: str


class TeachingScript(BaseModel):
    """Parsed teaching script generated from LaTeX summary source."""

    text: str
    anchors: list[SemanticAnchor] = Field(default_factory=list)


class LightningSpeakRequest(BaseModel):
    """Input payload for Lightning TTS generation."""

    latex_summary: str = Field(..., min_length=1)
    session_id: str | None = None
    voice_id: str | None = "sophia"
    anchors_enabled: bool = True
    metadata: dict[str, Any] | None = None


class LightningSpeakResponse(BaseModel):
    """Debug-friendly JSON response from the non-stream endpoint."""

    message: str
    teaching_script_preview: str
    anchors: list[SemanticAnchor] = Field(default_factory=list)
