# PocketProf — AI Voice Learning Engine
## Project Charter

---

## 1. Project Overview

PocketProf is an AI voice learning application that turns lectures (live recording or uploaded audio) into structured notes, spoken lesson playback, and voice-based Q&A.

The system uses:
- **Pulse** (Smallest.ai) for speech-to-text (file upload and live streaming).
- **Parse** (backend) to clean and structure transcripts into readable notes (e.g. Gemini-backed).
- **Lightning** (Smallest.ai) for text-to-speech with selectable voices.
- **Ask** (backend) for Q&A over the lesson and slides (e.g. Gemini + slide context).

The goal is to provide a single pipeline: **capture lecture → get notes → listen to AI "prof" → ask questions with your voice**.

---

## 2. System Architecture

### Pipeline Overview

**Input**
- User uploads an MP3 **or** records live in the browser.

**Transcription**
- **Pulse STT**: `/pulse/transcribe` (file) or `/pulse/live` (WebSocket) → raw transcript.

**Structuring**
- **Parse**: `/parse` — cleans and structures the transcript into polished notes (sections, bullets). Output is plain text (downloadable as .txt). No LaTeX in the main user flow.

**Optional: Slides**
- User can upload a PDF. Backend **Ask** module analyzes slides (`/ask/analyze`) and can align script to slides (`/ask/align`) for the Slide Player.

**Playback**
- **Lightning TTS**: `/lightning/stream` — converts lesson text (and Q&A answers) to speech. Multiple voices (e.g. Sophia, Rachel, Jordan, Arjun) selectable on the frontend.

**Q&A**
- **Ask**: `/ask` — user asks a question (voice → Pulse transcribe → Ask with slide/lesson context → Gemini → answer). Answer is spoken via Lightning TTS.

**Frontend**
- React + Vite. Single-page app: Homepage (branding, character/voice picker, voice sample), Lab (upload/record, parse, download, PDF upload, View Slides), Slide Player (notes + slides + TTS playback + voice Ask).

---

## 3. Backend Structure

| Route / Module | Purpose |
|----------------|---------|
| **Health** | `/health` — service status. |
| **Pulse** | `/pulse/transcribe`, `/pulse/live` — STT (file and streaming). |
| **Parse** | `/parse` — transcript → polished notes. |
| **Lightning** | `/lightning/stream` — TTS for lesson and Q&A answers. |
| **Ask** | `/ask`, `/ask/analyze`, `/ask/align`, `/ask/slides` — slide analysis, alignment, and Q&A with context. |
| **Electron** | `/electron/format` — optional formatting (not used in main frontend flow). |
| **Hydra** | `/hydra/qa` — optional Q&A (main Q&A flow uses Ask). |

---

## 4. Functional Modules (As Built)

### Module 1 — Lecture capture and transcription
- **Pulse STT**: Upload MP3 or live record → raw transcript.
- **Deliverable**: Transcript visible in Lab; available for Parse.

### Module 2 — Transcript to notes
- **Parse**: Raw transcript → polished, structured text.
- **Deliverable**: Downloadable .txt; optional result overlay after parse.

### Module 3 — Lesson and answer playback
- **Lightning TTS**: Text → speech with chosen voice.
- **Deliverable**: Playback in Slide Player; voice sample on homepage for each character.

### Module 4 — Slides and Q&A
- **Ask**: PDF slides analyzed and used as context; user asks by voice; answer generated (e.g. Gemini) and spoken via Lightning.
- **Deliverable**: View Slides + TTS + "Ask" flow in Slide Player.

---

## 5. MVP (As Shipped)

### Implemented
- Upload MP3 or record live → transcript.
- Parse → polished notes → download .txt.
- Upload PDF slides → view in Slide Player.
- Import notes → TTS playback with slide sync (where aligned).
- Voice Ask: ask question → transcribe → Ask API → TTS response.
- Homepage: branding, character/voice picker, voice sample.
- Result overlay after parse so download is always accessible.

### Optional / stretch
- Multi-language support.
- Session save.
- Further latency and UI polish.

---

## 6. Technical Principles

- Modular backend (routes per capability).
- Real-time streaming where used (Pulse live, Lightning stream).
- Clear separation: Pulse (STT), Parse (notes), Lightning (TTS), Ask (Q&A + slides).
- Frontend: single App with distinct views (Home, Lab, Slide Player); no Tailwind (custom CSS).

---

## 7. Demo Flow

1. **Homepage**: Pick a "prof" (voice), optionally play voice sample → "Get Started".
2. **Lab**: Upload an MP3 or record live → see transcript → click **Parse** → see result overlay → **Download .txt**.
3. **Lab**: Upload PDF slides → **View Slides**.
4. **Slide Player**: Import or use notes → **Start TTS** → listen; optionally **Ask** with voice and hear the answer.

---

## 8. Project Goal

PocketProf is a modular AI voice learning engine that turns raw lecture input (audio or live) into structured notes, spoken lesson playback, and voice-based Q&A, using Pulse, Parse, Lightning, and Ask as implemented in the current codebase.

