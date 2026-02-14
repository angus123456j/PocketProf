# PocketProf — Voice to Text Frontend

Minimal React app that records speech and transcribes it via the backend (Pulse STT).

## Quick Start

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Run the backend (in another terminal)

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

### 3. Run the frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. The app proxies `/api` requests to the backend at `http://127.0.0.1:8000`.

## Usage

1. Click **Record** — grant mic access, then speak.
2. Click **Finish** — recording stops and is sent to the backend for transcription.
3. View the transcript and click **Download .txt** to save it.

## Config

- `VITE_API_URL`: Override API base (default: `/api`, uses Vite proxy to backend).
