import httpx

from app.config import get_settings

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

SYSTEM_INSTRUCTION = """You are a lecture formatter. Given a raw transcript of spoken content, reorganise it into a clear, structured lecture document. Use:

- Clear section headings for main topics
- Bullet points for key points
- Explicitly mark questions (e.g. "Q: ..." or "Question: ...")
- Remove filler words and repetitions
- Keep the original meaning and order of ideas

Output plain text only. No LaTeX, no markdown formatting symbols."""


async def parse_transcript(raw_text: str) -> str:
    """Format raw transcript into a polished lecture using Gemini."""
    settings = get_settings()
    # #region agent log
    try:
        import json as _j
        with open("/Users/angoos/Documents/pocketprof/.cursor/debug.log", "a") as _f:
            _f.write(_j.dumps({"location":"parse_service:pre_request","message":"Calling Gemini","data":{"url":GEMINI_URL,"text_len":len(raw_text),"has_key":bool(settings.GEMINI_API_KEY)},"hypothesisId":"H1,H2","timestamp":__import__("time").time()*1000}) + "\n")
    except Exception:
        pass
    # #endregion
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GEMINI_URL,
            headers={
                "x-goog-api-key": settings.GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
                "contents": [{"parts": [{"text": raw_text}]}],
            },
        )
        # #region agent log
        try:
            import json as _j
            err_body = response.text[:500] if not response.is_success else ""
            with open("/Users/angoos/Documents/pocketprof/.cursor/debug.log", "a") as _f:
                _f.write(_j.dumps({"location":"parse_service:response","message":"Gemini response","data":{"status":response.status_code,"reason":getattr(response,"reason_phrase",""),"body_preview":err_body},"hypothesisId":"H1","timestamp":__import__("time").time()*1000}) + "\n")
        except Exception:
            pass
        # #endregion
        response.raise_for_status()
        data = response.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("No response from Gemini")
    parts = candidates[0].get("content", {}).get("parts", [])
    if not parts:
        raise ValueError("Empty response from Gemini")
    return parts[0].get("text", "").strip()
