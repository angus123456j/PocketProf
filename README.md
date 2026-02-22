# PocketProf

**Voice-first AI lecture assistant: capture speech, get structured notes, listen to an AI professor, and ask questions with your voice.**



---

## TEAM:

Angus Lang, Kevin Xu, Mo Naqi

---

---

## One-Line Summary

PocketProf turns live or uploaded lecture audio into polished notes, speaks them back with a chosen AI voice (Smallest.ai Lightning), and answers follow-up questions via voice using Pulse for speech-to-text and Lightning for text-to-speech.

---

## Problem

When a student misses a class—whether from scheduling conflicts, an early 8:30 lecture they couldn't make, or illness—that context is gone forever. The lesson won't be retaught to them; the professor will only cover it again next term or next year. In the meantime, the professor may branch into new topics, go deeper on certain questions, and answer student questions that clarify the material for the whole room. One student's question is often many students' question. But for everyone who missed that class, they miss the lecture, the tangents, and the Q&A forever. Students and educators need a way to turn lecture recordings into usable study material and to ask clarifying questions without typing. We built PocketProf so that live lectures can be **captured forever**, questions and answers can be **preserved**, and students who missed the class can **relearn that exact lesson**—with their pocket prof—when they're ready. Voice-in, voice-out keeps the experience natural and fits review while multitasking or on the go, without forcing a switch to typing.

---

## Solution Overview

1. **User speaks or uploads** — User records live in the browser or uploads an MP3. Speech is sent to the backend.
2. **System transcribes** — Smallest.ai Pulse converts audio to text (batch upload or real-time WebSocket).
3. **System structures** — Backend Parse service (Gemini) cleans and structures the transcript into sections and bullets. User downloads a .txt file or sees it in a result overlay.
4. **User optionally adds slides** — User uploads a PDF. Backend uses **Google Gemini Vision** to analyze slide images (extract text and structure). That analysis is used to align the lesson script to slides for the Slide Player.
5. **User picks a voice** — On the homepage, the four Smallest.ai Lightning voices (Sophia, Rachel, Jordan, Arjun) are represented as **3D characters** in the browser using **Three.js** (React Three Fiber + Drei). The user selects a “prof” by character and can play a short voice sample before starting.
6. **User listens** — User imports the polished notes into the Slide Player and starts TTS. Smallest.ai Lightning streams synthesized speech in the selected voice. **Slides auto-advance** to match the lesson as the professor speaks (script-to-slide alignment).
7. **User asks aloud** — User asks a question by voice. Pulse transcribes the question; Ask service (Gemini) answers using lesson and slide context; Lightning speaks the answer. The system may **jump to a different slide** that contains the content relevant to the answer, so the student sees the right slide while hearing the reply. Full loop is voice-in, voice-out.

---

## Architecture

- **Frontend**: React 19 + Vite. Single-page app with three main views: Home (branding, Three.js character/voice picker for the four Smallest.ai voices, voice sample), Lab (upload/record, parse, download, PDF upload, View Slides), Slide Player (notes, slides, TTS playback with slide auto-advance, voice Ask with slide jump to relevant content). Uses custom CSS; no Tailwind. Proxies `/api` and WebSockets to the backend.
- **Backend**: FastAPI. Modular routes: Pulse (STT), Parse (transcript → notes), Lightning (TTS), Ask (slide analysis, alignment, Q&A). Runs at `http://127.0.0.1:8000`; frontend calls `/api/*`, which Vite rewrites to the backend.
- **Smallest.ai**: Pulse for all speech-to-text (batch and live streaming). Lightning v3.1 for all text-to-speech (lesson and Q&A answers). No other STT/TTS providers in the main flow.
- **Gemini**: Used for Parse (transcript structuring), slide content analysis (Vision API to extract text and structure from slide images), and Ask (Q&A with lesson/slide context). Not used for voice I/O.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                                  │
│  Home → Lab → Slide Player   │   Mic / Upload   │   Playback / Ask       │
└─────────────────────────────┼─────────────────┼────────────────────────┘
                              │ /api            │
                              ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend (FastAPI :8000)                                                 │
│  /pulse/transcribe, /pulse/live (WS)  →  Smallest.ai Pulse (STT)        │
│  /parse                               →  Gemini (structure transcript)  │
│  /lightning/stream                     →  Smallest.ai Lightning (TTS)   │
│  /ask, /ask/analyze, /ask/align       →  Gemini (Q&A, slide vision)     │
└─────────────────────────────────────────────────────────────────────────┘
                              │                 │
                              ▼                 ▼
┌─────────────────────────────┐   ┌─────────────────────────────────────┐
│  Smallest.ai Pulse          │   │  Smallest.ai Lightning v3.1         │
│  - Batch: POST get_text     │   │  - POST stream, PCM 24kHz            │
│  - Live: WebSocket get_text │   │  - voice_id (sophia, rachel, etc.)   │
└─────────────────────────────┘   └─────────────────────────────────────┘
```

**API flow (simplified)**

- **Record or upload** → Frontend sends audio to `POST /pulse/transcribe` or streams via `WS /pulse/live` → backend forwards to Pulse → transcript returned.
- **Parse** → Frontend sends transcript to `POST /parse` → backend calls Gemini → polished text returned; frontend shows result overlay and Download .txt.
- **TTS** → Frontend sends script + voice_id to `POST /lightning/stream` → backend converts to teaching script, streams from Lightning, returns PCM → frontend converts to WAV and plays.
- **Ask** → User speaks → frontend records, sends to `POST /pulse/transcribe` → question text → `POST /ask` with context → Gemini answer → `POST /lightning/stream` with answer → frontend plays response.

---

## Sponsor Integration (Smallest.ai)

**How Smallest.ai is used**

- **Pulse (STT)**  
  - **Batch**: Uploaded audio (e.g. MP3, WebM) is sent to `https://waves-api.smallest.ai/api/v1/pulse/get_text` with `Authorization: Bearer SMALLEST_API_KEY`. Used for file upload and for transcribing the user’s Ask question.  
  - **Live**: Browser streams raw audio over WebSocket to the backend; backend opens a WebSocket to `wss://waves-api.smallest.ai/api/v1/pulse/get_text` (language=en, encoding=linear16, sample_rate=16000), forwards client audio to Pulse, and streams transcript messages back. Used for live recording in the Lab.  
  - Pulse is the only STT provider in the main flow; it is used for both lecture capture and voice Q&A input.

- **Lightning v3.1 (TTS)**  
  - All spoken output goes through Lightning: lesson playback and Ask answers.  
  - Backend uses `SmallestLightningClient` to call `https://waves-api.smallest.ai/api/v1/lightning-v3.1/stream` with `text`, `voice_id`, `model`, `sample_rate`, `output_format`.  
  - Response is streamed PCM (24 kHz, 16-bit); backend streams it to the frontend; frontend converts to WAV and plays with the HTML5 Audio API.  
  - Multiple voices (sophia, rachel, jordan, arjun) are supported; the user selects a “prof” on the homepage via a **Three.js** (React Three Fiber + Drei) 3D character picker and can play a short voice sample before starting.

**Why Smallest.ai**

- Single provider for both STT and TTS keeps the pipeline simple and consistent.  
- Pulse’s WebSocket API enables real-time transcript display during recording.  
- Lightning’s streaming API allows low-latency playback and multiple voices, which fits the “pick a professor” and “ask and hear the answer” UX.

**Depth of integration**

- Pulse: batch and real-time paths; backend proxies and forwards binary/text correctly; frontend handles WebSocket lifecycle and reconnection.  
- Lightning: streaming only; backend parses LaTeX/teaching script, estimates duration and progress, supports semantic anchors for future slide sync; frontend requests TTS with the chosen voice_id for both lesson and Ask answers.

---

## Technical Highlights

- **Real-time Pulse streaming**: Backend bridges browser WebSocket and Smallest Pulse WebSocket; client sends binary chunks and receives incremental transcript JSON until end.
- **Lightning streaming**: TTS is streamed from Lightning through the backend to the frontend; no single large buffer; frontend plays as WAV via object URL.
- **Three.js character picker**: The four Smallest.ai Lightning voices are represented as 3D characters on the homepage (React Three Fiber + Drei); the user selects a voice by character and can play a short sample before starting.
- **Google Gemini for slides**: Slide images (PDF pages as base64) are sent to **Gemini Vision** in batches to extract text and structure; that analysis powers script-to-slide alignment and Q&A context.
- **Slide sync and Q&A jump**: During lesson playback, slides **auto-advance** to match the current segment (backend alignment of script to slide numbers). When the user **asks a question by voice**, the system can **jump to the slide** that contains the content relevant to the answer, so the student sees the right slide while hearing the reply.
- **Modular backend**: Separate FastAPI routers and services for Pulse, Parse, Lightning, Ask; config via Pydantic Settings and `.env`.
- **Ask flow**: Voice question → Pulse transcribe → Gemini with lesson/slide context → Lightning for answer; frontend manages record/stop, playback, and resume of lesson after the answer.
- **Result overlay**: After Parse completes, a full-screen overlay shows the polished transcript and Download button so long content is never cut off.
- **Voice sample**: Homepage character picker calls Lightning with a short phrase per voice so users can preview before starting.

---

## Repository Structure

```
pocketprof/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, route mounting
│   │   ├── config.py         # Settings (SMALLEST_API_KEY, GEMINI_API_KEY, etc.)
│   │   ├── routes/           # pulse, parse, lightning, ask, health, electron, hydra
│   │   ├── services/         # pulse_service, pulse_realtime, lightning_service,
│   │   │                     # smallest_lightning_client, ask_service, parse_service
│   │   ├── models/           # Pydantic request/response models
│   │   └── utils/            # latex_parser (for Lightning script prep)
│   ├── .env.example
│   ├── requirements.txt
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main SPA (Home, Lab, Slide Player)
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── components/
│   │       └── CharacterScene.jsx   # 3D character picker, voice sample
│   ├── public/               # logo, favicon, character assets, frontendimg
│   ├── index.html
│   ├── package.json
│   └── vite.config.js        # /api proxy to backend
├── docs/
│   ├── project_charter.md
│   └── issue_board.md
└── README.md
```

---

## Future Improvements

- **Latency**: Measure and reduce TTFB for Lightning stream; consider chunked or segment-level TTS for very long lessons.
- **Robustness**: Stricter error handling and retries for Pulse/Lightning; clearer frontend errors when keys are missing or quotas hit.
- **Session**: Persist session or project (transcript + notes + slide refs) so users can return without re-uploading.
- **Electron/Hydra**: Current flow uses Parse + Ask; evaluate whether Electron or Hydra routes add value or can be removed to simplify the stack.



