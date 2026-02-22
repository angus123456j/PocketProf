# Upgrading to Vercel

This guide walks you through deploying PocketProf’s **frontend** to Vercel. The backend (FastAPI) runs elsewhere and is connected via an environment variable.

---

## 1. What gets deployed on Vercel

- **Frontend only**: the React + Vite app in `frontend/` is built and served by Vercel.
- **Backend**: stays on your machine or another host (e.g. Railway, Render, Fly.io). The frontend calls it using `VITE_API_URL`.

---

## 2. Prerequisites

- A [Vercel](https://vercel.com) account (GitHub login is easiest).
- The project in a Git repo (e.g. GitHub) so Vercel can connect to it.
- The backend running at a public URL (for production). Locally you can keep using `http://127.0.0.1:8000` for testing.

---

## 3. Deploy the frontend to Vercel

### Option A: Deploy with the Vercel dashboard (recommended)

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New…** → **Project**.
3. Import your Git repository (e.g. `voice-hackathon`). If it’s not listed, connect GitHub and select the repo.
4. Configure the project:
   - **Root Directory**: set to `frontend` (so Vercel builds the React app, not the repo root).
   - **Framework Preset**: Vite (Vercel usually detects it).
   - **Build Command**: `npm run build` (default for Vite).
   - **Output Directory**: `dist` (Vite’s default).
   - **Install Command**: `npm install`.
5. Add environment variables (see step 4 below), then click **Deploy**.
6. After the build finishes, Vercel gives you a URL like `https://your-project-xxx.vercel.app`.

### Option B: Deploy with the Vercel CLI

1. Install the CLI:
   ```bash
   npm i -g vercel
   ```
2. From the **repo root** (not inside `frontend`), run:
   ```bash
   cd frontend
   vercel
   ```
3. Follow the prompts:
   - Link to existing project or create a new one.
   - Confirm **root directory** is the current directory (the `frontend` folder).
4. Add env vars (see step 4) in the [Vercel dashboard](https://vercel.com/dashboard) under your project → **Settings** → **Environment Variables**, then redeploy:
   ```bash
   vercel --prod
   ```

---

## 4. Environment variables on Vercel

In the Vercel project → **Settings** → **Environment Variables**, add:

| Name            | Value                    | Notes |
|-----------------|--------------------------|--------|
| `VITE_API_URL`  | `https://your-backend-url.com` | Full URL of your FastAPI backend (no trailing slash). Use your real backend URL when you deploy it (e.g. Railway). For local backend testing you can leave this unset in Vercel and the app will use relative `/api`, but then you must use a local proxy or CORS. |

- **Important**: Any variable that must be available in the browser must start with `VITE_`. Only `VITE_API_URL` is needed for the frontend; secrets (e.g. API keys) stay on the backend.
- After adding or changing env vars, trigger a new deployment (e.g. **Deployments** → **⋯** → **Redeploy**).

---

## 5. Backend: where to host it

Vercel serves the frontend and does not run your FastAPI server. You need to host the backend separately.

- **Railway**: [railway.app](https://railway.app) — add a GitHub repo, set root to `backend`, add a `Dockerfile` or use Nixpacks, set env vars (e.g. `SMALLEST_API_KEY`, `GEMINI_API_KEY`), deploy. Use the generated URL as `VITE_API_URL`.
- **Render**: [render.com](https://render.com) — create a **Web Service**, connect the repo, set root to `backend`, build command and start command for Python/FastAPI, add env vars. Use the service URL as `VITE_API_URL`.
- **Fly.io**: [fly.io](https://fly.io) — add a `Dockerfile` in `backend/`, then `fly launch` and `fly deploy`. Use the app URL as `VITE_API_URL`.

After the backend is live, set **VITE_API_URL** on Vercel to that URL (e.g. `https://pocketprof-api.railway.app`) and redeploy the frontend.

---

## 6. CORS on the backend

Your FastAPI app must allow requests from the Vercel domain. In the backend, ensure CORS includes your frontend origin, for example:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://your-project.vercel.app",
        "https://*.vercel.app",  # if you use preview URLs
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Replace `your-project` with your actual Vercel project name, or use a list of allowed origins.

---

## 7. Quick checklist

- [ ] Repo connected to Vercel, **Root Directory** = `frontend`.
- [ ] `VITE_API_URL` set on Vercel to your backend URL (when backend is deployed).
- [ ] Backend deployed somewhere and CORS updated with the Vercel URL.
- [ ] Redeploy after any env or CORS change.

---

## 8. Local preview with production API

To run the frontend locally but talk to a deployed backend:

```bash
cd frontend
VITE_API_URL=https://your-backend-url.com npm run dev
```

Then open `http://localhost:5173`; the app will call your production API and WebSockets will use the same host (derived from `VITE_API_URL` in the code).

---

## Summary

| Component   | Where it runs   | Notes |
|------------|------------------|--------|
| Frontend   | Vercel           | Root = `frontend`, build = `npm run build`, set `VITE_API_URL`. |
| Backend    | Railway / Render / Fly / etc. | Set all API keys there; expose a public URL and add it to CORS. |
| Connection | Env var `VITE_API_URL` | Frontend uses this for REST and derives the WebSocket URL from it. |

Once both are deployed and `VITE_API_URL` and CORS are set, your Vercel URL will serve the app and it will use your hosted backend.
