from __future__ import annotations

import re

from app.models.lightning import SemanticAnchor, TeachingScript

_STUDENT_PATTERNS = (r"\ba student asked\b", r"\bstudent question\b")
_TRICK_PATTERNS = (r"\bprof(?:essor)?'?s trick\b", r"\bprofessor'?s trick\b")
_CONCEPT_PATTERNS = (r"\bcore concept\b", r"\bimportant point\b", r"\bkey idea\b")


def latex_to_teaching_script(latex_summary: str) -> TeachingScript:
    """Convert LaTeX-heavy summary text into speech-ready script + anchors."""
    text = _normalize_text(latex_summary)
    text = _replace_frac(text)
    text = _replace_sqrt(text)
    text = _replace_exponents(text)
    text = _replace_math_operators(text)
    text = _normalize_whitespace(text)
    anchors = _extract_anchors(text)
    return TeachingScript(text=text, anchors=anchors)


def _normalize_text(text: str) -> str:
    text = text.replace("\\n", " ")
    text = text.replace("\\%", " percent")
    text = text.replace("\\$", " dollar")
    text = text.replace("`", "'")
    return text.strip()


def _replace_frac(text: str) -> str:
    pattern = re.compile(r"\\frac\{([^{}]+)\}\{([^{}]+)\}")
    for _ in range(10):
        new_text, changed = pattern.subn(r"\1 over \2", text)
        text = new_text
        if changed == 0:
            break
    return text


def _replace_sqrt(text: str) -> str:
    pattern = re.compile(r"\\sqrt\{([^{}]+)\}")
    for _ in range(10):
        new_text, changed = pattern.subn(r"square root of \1", text)
        text = new_text
        if changed == 0:
            break
    return text


def _replace_exponents(text: str) -> str:
    pattern = re.compile(
        r"(?P<base>[A-Za-z0-9\)\]])\s*\^\s*(?:\{(?P<braced>[^{}]+)\}|(?P<plain>[A-Za-z0-9]+))"
    )

    def replacer(match: re.Match[str]) -> str:
        base = match.group("base")
        exponent = (match.group("braced") or match.group("plain") or "").strip()
        if exponent == "2":
            phrase = "squared"
        elif exponent == "3":
            phrase = "cubed"
        else:
            phrase = f"to the power of {exponent}"
        return f"{base} {phrase}"

    return pattern.sub(replacer, text)


def _replace_math_operators(text: str) -> str:
    text = re.sub(r"(?<=[A-Za-z0-9\)])\s*\+\s*(?=[A-Za-z0-9\(])", " plus ", text)
    text = re.sub(r"(?<=[A-Za-z0-9\)])\s*=\s*(?=[A-Za-z0-9\(])", " equals ", text)
    text = re.sub(r"(?<=[A-Za-z0-9\)])\s*-\s*(?=[A-Za-z0-9\(])", " minus ", text)
    return text


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _extract_anchors(text: str) -> list[SemanticAnchor]:
    anchors: list[SemanticAnchor] = []
    sentence_pattern = re.compile(r"[^.!?]+[.!?]?")

    for sentence_match in sentence_pattern.finditer(text):
        sentence = sentence_match.group().strip()
        if not sentence:
            continue

        lower = sentence.lower()
        anchor_type, label = _classify_anchor(lower)
        if anchor_type is None:
            continue

        anchors.append(
            SemanticAnchor(
                anchor_id=f"anchor_{len(anchors) + 1}",
                anchor_type=anchor_type,
                span_start=sentence_match.start(),
                span_end=sentence_match.end(),
                label=label,
                text=sentence,
            )
        )

    return anchors


def _classify_anchor(sentence_lower: str) -> tuple[str | None, str]:
    if any(re.search(pattern, sentence_lower) for pattern in _STUDENT_PATTERNS):
        return "student_question", "Student Question"
    if any(re.search(pattern, sentence_lower) for pattern in _TRICK_PATTERNS):
        return "prof_trick", "Professor Trick"
    if _is_math_heavy(sentence_lower):
        return "math_proof", "Math Proof"
    if any(re.search(pattern, sentence_lower) for pattern in _CONCEPT_PATTERNS):
        return "concept", "Concept"
    return None, ""


def _is_math_heavy(sentence_lower: str) -> bool:
    math_keywords = (
        " equals ",
        " plus ",
        " minus ",
        " over ",
        " square root ",
        " squared",
        " cubed",
        " to the power of ",
    )
    score = sum(1 for token in math_keywords if token in sentence_lower)
    return score >= 2

