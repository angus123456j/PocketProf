import httpx

from app.config import get_settings

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

SYSTEM_INSTRUCTION_QA = """You are a helpful teaching assistant. The student is listening to a lesson and has asked a question.

If context from the lesson is provided below, use it to give a relevant, concise answer. Otherwise answer the question clearly and briefly.

- Keep answers to 1–3 short paragraphs so they can be read aloud.
- Use plain language. No LaTeX or markdown.
- If the question is unclear or off-topic, answer politely and suggest they rephrase or wait for the relevant part of the lesson."""


async def answer_question(question: str, context: str | None = None) -> str:
    """Answer the student's question using Gemini, optionally with lesson context."""
    settings = get_settings()
    system_text = SYSTEM_INSTRUCTION_QA
    if context and context.strip():
        system_text += f"\n\nLesson context (for reference only):\n{context.strip()}"
    user_text = question.strip()
    if not user_text:
        raise ValueError("Question cannot be empty")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GEMINI_URL,
            headers={
                "x-goog-api-key": settings.GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "systemInstruction": {"parts": [{"text": system_text}]},
                "contents": [{"parts": [{"text": user_text}]}],
            },
        )
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("No response from Gemini")
    parts = candidates[0].get("content", {}).get("parts", [])
    if not parts:
        raise ValueError("Empty response from Gemini")
    return parts[0].get("text", "").strip()
