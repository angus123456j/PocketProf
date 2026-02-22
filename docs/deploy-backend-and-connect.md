# Deploy Backend and Connect Frontend

This guide covers deploying the PocketProf **backend** (FastAPI) to a cloud host, then connecting your **frontend** (e.g. on Vercel) so the full app works in production.

---

## Overview

| Component | Where it runs | What you need |
|-----------|----------------|---------------|
| **Backend** | Railway, Render, or Fly.io | API keys, CORS set for your frontend URL |
| **Frontend** | Vercel | `VITE_API_URL` = your backend URL |

The frontend calls the backend for transcription, TTS, parse, and Ask. No API keys go on Vercel—only on the backend.

---

## 1. Prepare the backend for production

### 1.1 CORS: allow your frontend origin

The backend must allow requests from your Vercel (or other) frontend URL. In **`backend/app/main.py`**, update the CORS middleware to include your deployed frontend:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "null",
        "http://127.0.0.1",
        "http://localhost",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://your-project.vercel.app",   # your Vercel production URL
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://[\w-]+\.vercel\.app$",  # localhost + Vercel previews
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Replace `your-project` with your actual Vercel project name. If you use a custom domain, add that too (e.g. `https://pocketprof.com`).

### 1.2 Environment variables the backend needs

These go in your **backend** host (Railway / Render / Fly), not in Vercel:

| Variable | Description |
|----------|-------------|
| `SMALLEST_API_KEY` | Smallest.ai API key (Pulse + Lightning) |
| `GEMINI_API_KEY` | Google Gemini API key (Parse, Ask, slide analysis) |
| `LIGHTNING_API_URL` | Optional; default is Smallest.ai Lightning v3.1 stream URL |
| `LIGHTNING_MODEL` | Optional; default `lightning` |
| `APP_ENV` | e.g. `production` |
| `PORT` | Set by Railway/Render (e.g. `8000` or `10000`) |

See **`backend/.env.example`** for the full list. The host will inject `PORT`; you set the rest.

---

## 2. Deploy the backend

### Option A: Railway

1. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
2. **New Project** → **Deploy from GitHub repo** → select your repo.
3. **Settings** for the service:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt` (or leave default if it detects Python).
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Variables**: Add `SMALLEST_API_KEY`, `GEMINI_API_KEY`, and any others from `.env.example`. Railway usually sets `PORT` automatically.
5. Deploy. Copy the public URL (e.g. `https://your-app.railway.app`).

### Option B: Render

1. Go to [render.com](https://render.com) and sign in.
2. **New** → **Web Service** → connect your GitHub repo.
3. **Settings**:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Environment**: Python 3.
4. **Environment**: Add `SMALLEST_API_KEY`, `GEMINI_API_KEY`, etc. Render sets `PORT`.
5. Deploy. Copy the service URL (e.g. `https://your-service.onrender.com`).

### Option C: Fly.io

1. Install [flyctl](https://fly.io/docs/hub/install/) and sign in: `fly auth login`.
2. In **`backend/`**, create a **`Dockerfile`** (example):

   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY . .
   CMD uvicorn app.main:app --host 0.0.0.0 --port 8080
   ```

3. Run:
   ```bash
   cd backend
   fly launch
   ```
   Set app name, region; do not add a Postgres/Redis if asked.
4. Set secrets (API keys):
   ```bash
   fly secrets set SMALLEST_API_KEY=your_key GEMINI_API_KEY=your_key
   ```
5. Deploy: `fly deploy`. Copy the app URL (e.g. `https://your-app.fly.dev`).

---

## 3. Connect the frontend to the backend

### 3.1 If the frontend is on Vercel

1. Open your project on [vercel.com](https://vercel.com) → **Settings** → **Environment Variables**.
2. Add:
   - **Name**: `VITE_API_URL`
   - **Value**: your backend URL, e.g. `https://your-app.railway.app` or `https://your-service.onrender.com` (no trailing slash).
   - Apply to **Production** (and **Preview** if you want).
3. **Redeploy** the frontend (e.g. **Deployments** → **⋯** → **Redeploy**) so the build picks up `VITE_API_URL`.

The frontend uses `VITE_API_URL` for all API and WebSocket calls, so “Play sample”, transcription, TTS, and Ask will use your deployed backend.

### 3.2 Verify

- Open your Vercel app URL.
- Click **Play sample** for a prof; you should hear the sample (backend TTS).
- Try uploading an MP3 or using the full flow.

If samples or requests fail, check:

- Backend CORS includes your Vercel URL (and `https://*.vercel.app` if using previews).
- `VITE_API_URL` has no trailing slash and uses `https://`.
- Backend env vars (especially `SMALLEST_API_KEY`, `GEMINI_API_KEY`) are set on the backend host.

---

## 4. Quick checklist

- [ ] CORS in **`backend/app/main.py`** includes your frontend URL (and `*.vercel.app` if needed).
- [ ] Backend deployed (Railway / Render / Fly) with **Root Directory** = `backend` and start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (or `8080` for Fly Dockerfile).
- [ ] Backend env vars set on the backend host: `SMALLEST_API_KEY`, `GEMINI_API_KEY`, etc.
- [ ] Frontend on Vercel has **`VITE_API_URL`** = backend URL; frontend redeployed after adding it.
- [ ] “Play sample” and other features work from the Vercel site.

---

## 5. Local testing with production backend

To run the frontend locally but talk to the deployed backend:

```bash
cd frontend
VITE_API_URL=https://your-backend-url.com npm run dev
```

Then open `http://localhost:5173`; it will call your production backend.
