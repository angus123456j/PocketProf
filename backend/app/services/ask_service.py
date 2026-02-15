import httpx

from app.config import get_settings
from app.models.base import SlideContext
import json
import asyncio

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


async def analyze_slides(images_b64: list[str]) -> list[SlideContext]:
    """
    Sends slide images to Gemini Vision to extract text and descriptions.
    Batches requests aggressively to avoid 429 errors.
    """
    settings = get_settings()
    all_results = []
    # Vision models have much tighter TPM limits.
    # Reducing batch size to 2 slides per request to stay under RPM/TPM.
    batch_size = 2 
    
    for i in range(0, len(images_b64), batch_size):
        batch = images_b64[i : i + batch_size]
        parts = []
        for j, img in enumerate(batch):
            slide_idx = i + j + 1
            if "base64," in img:
                img = img.split("base64,")[1]
                
            parts.append({"text": f"--- Slide {slide_idx} ---"})
            parts.append({
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": img
                }
            })
        
        prompt = """
        Analyze these lecture slides sequentially. For EACH slide, provide:
        1. A detailed visual description (diagrams, charts, images).
        2. All text content extracted verbatim.
        
        Output strictly in JSON format as a list of objects:
        [
            {"slide_number": X, "description": "...", "text_content": "..."},
            ...
        ]
        Do not use markdown code blocks. Just valid JSON.
        """
        parts.append({"text": prompt})

        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{GEMINI_URL}?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": parts}],
                    "generationConfig": {"response_mime_type": "application/json"} 
                },
            )
            
            # Explicitly catch 429
            if response.status_code == 429:
                raise httpx.HTTPStatusError("Rate limit exceeded", request=response.request, response=response)
                
            response.raise_for_status()
            data = response.json()
            
        try:
            candidates = data.get("candidates", [])
            if not candidates:
                raise ValueError("No candidates returned from Gemini")
                
            text_response = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            
            # JSON cleanup
            clean_json = text_response.strip()
            if clean_json.startswith("```"):
                lines = clean_json.split("\n")
                if lines[0].startswith("```"): lines = lines[1:]
                if lines[-1].startswith("```"): lines = lines[:-1]
                clean_json = "\n".join(lines).strip()

            slides_data = json.loads(clean_json)
            all_results.extend([SlideContext(**s) for s in slides_data])
            
            # Aggressive delay: Vision tokens count for a lot in RPM/TPM limits
            if i + batch_size < len(images_b64):
                await asyncio.sleep(4.0) 
            
        except Exception as e:
            print(f"Error in batch {i}: {e}")
            raise ValueError(f"Batch analysis failed: {str(e)}")
            
    return all_results


async def chat_with_slides(query: str, context: list[SlideContext], current_slide: int, history: list[dict]) -> dict:
    """
    Chat with the slides context.
    Returns {"answer": str, "suggested_slide": int | None}
    """
    settings = get_settings()
    
    # Construct system prompt with context
    context_str = "\n".join([
        f"--- Slide {s.slide_number} ---\n[Visuals]: {s.description}\n[Text]: {s.text_content}"
        for s in context
    ])
    
    system_instruction = f"""
    You are a teaching assistant helping a student with their lecture slides.
    
    CONTEXT (Slides):
    {context_str}
    
    CURRENT SLIDE: {current_slide + 1}
    
    INSTRUCTIONS:

    1. Understand the student’s question and identify the key concept(s).

    2. Answer using the slide content as the primary source.
    - If the answer is clearly supported by the slides, base your answer on them.
    - If the question is relevant to the topic but not explicitly covered, answer using general knowledge, but connect it briefly to the slide material.
    - If the question is not relevant to the slide topic, respond: "This question is not relevant to the provided slides."

    3. Determine the MOST relevant slide:
    - Compare the question against all slides.
    - Select the single best matching slide.
    - Always return one slide number (even if it is the current slide).

    4. Keep the answer concise:
    - Maximum 2–4 sentences
    - No unnecessary explanation
    - Be clear and direct

    5. Do NOT include reasoning or explanations about how you chose the slide.

    OUTPUT FORMA:
    Return JSON:
    {{
        "answer": "Your answer here...",
        "suggested_slide": 5  // Optional: null if no change needed, or if strictly answering from current slide.
    }}

    """
    
    contents = []
    # Add history
    for msg in history:
        role = "user" if msg["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        
    # Add current query
    contents.append({"role": "user", "parts": [{"text": query}]})

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{GEMINI_URL}?key={settings.GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "systemInstruction": {"parts": [{"text": system_instruction}]},
                "contents": contents,
                "generationConfig": {"response_mime_type": "application/json"}
            },
        )
        response.raise_for_status()
        data = response.json()
        
    try:
        text_response = data["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text_response)
        return result
    except Exception as e:
        print(f"Error parsing chat response: {e}")
        return {"answer": "I'm sorry, I couldn't process that request.", "suggested_slide": None}


async def align_script_with_slides(script: str, context: list[SlideContext]) -> list[dict]:
    """
    Aligns a lesson script with the provided slide context.
    Returns a list of segments, each with a corresponding slide number.
    """
    settings = get_settings()

    # Construct context string
    context_str = "\n".join([
        f"--- Slide {s.slide_number} ---\n[Visuals]: {s.description}\n[Text]: {s.text_content}"
        for s in context
    ])

    system_instruction = f"""
    You are an expert educational content aligner.
    
    TASK:
    Given a full lesson script and a set of slides, segment the script and assign each segment to the most relevant slide.
    
    CONTEXT (Slides):
    {context_str}
    
    INPUT SCRIPT:
    {script}
    
    INSTRUCTIONS:
    1. Break the script into logical segments based on topic shifts.
    2. For each segment, identify the single most relevant slide number.
    3. Ensure the ENTIRE script is covered, in the original order.
    4. Segments should be relatively long (paragraphs), not single sentences, unless the slide changes rapidly.
    
    OUTPUT FORMAT:
    Return a strictly valid JSON list of objects:
    [
        {{ "text": "First part of the script...", "slide_number": 1 }},
        {{ "text": "Second part moving to next topic...", "slide_number": 2 }},
        ...
    ]
    """

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{GEMINI_URL}?key={settings.GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "systemInstruction": {"parts": [{"text": system_instruction}]},
                "contents": [{"parts": [{"text": "Align this script."}]}],
                "generationConfig": {"response_mime_type": "application/json"}
            },
        )
        response.raise_for_status()
        data = response.json()

    try:
        text_response = data["candidates"][0]["content"]["parts"][0]["text"]
        
        # JSON cleanup if needed
        clean_json = text_response.strip()
        if clean_json.startswith("```"):
            lines = clean_json.split("\n")
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            clean_json = "\n".join(lines).strip()
            
        segments = json.loads(clean_json)
        print(f"Alignment successful: {len(segments)} segments created.")
        return segments
    except Exception as e:
        print(f"Error aligning script: {e}")
        # Fallback: assign entire script to slide 1
        return [{"text": script, "slide_number": 1}]
