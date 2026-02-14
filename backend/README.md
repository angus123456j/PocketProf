# PocketProf — AI Voice Learning Engine Backend

Modular FastAPI backend powering the PocketProf AI voice learning platform.

## Quick Start

### 1. Create a virtual environment

```bash
cd backend
python -m venv venv
source venv/bin/activate   # macOS / Linux
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Copy the example env file and fill in your API keys:

```bash
cp .env.example .env
```

### 4. Run the development server

```bash
uvicorn app.main:app --reload
```

The API will be available at **http://127.0.0.1:8000**.

Interactive docs are served at **http://127.0.0.1:8000/docs**.

## Project Structure

```
backend/
├── app/
│   ├── main.py            # FastAPI application entry point
│   ├── config.py          # Settings & logging configuration
│   ├── routes/            # API route handlers
│   │   ├── health.py
│   │   ├── pulse.py
│   │   ├── electron.py
│   │   ├── lightning.py
│   │   └── hydra.py
│   ├── services/          # Business logic layer
│   │   ├── pulse_service.py
│   │   ├── electron_service.py
│   │   ├── lightning_service.py
│   │   └── hydra_service.py
│   └── models/            # Pydantic models
│       └── base.py
├── .env                   # Environment variables (not committed)
├── .env.example           # Template for environment variables
├── requirements.txt
└── README.md
```

## API Endpoints

| Method | Path                   | Description              |
|--------|------------------------|--------------------------|
| GET    | `/health`              | Health check             |
| POST   | `/pulse/stream`        | Pulse streaming pipeline |
| POST   | `/pulse/transcribe`    | Batch transcription (upload audio, get text) |
| POST   | `/pulse/transcribe-latex` | Transcribe audio and return LaTeX document |
| POST   | `/parse`                 | Format raw transcript into polished lecture (Gemini) |
| POST   | `/electron/format`     | Electron formatting      |
| POST   | `/lightning/speak`     | Lightning TTS            |
| POST   | `/hydra/qa`            | Hydra Q&A                |
