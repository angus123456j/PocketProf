# Deploy PocketProf Backend to Render (Step-by-Step)

This guide walks you through deploying the **PocketProf backend** (FastAPI) to [Render](https://render.com) only. After this, you point your Vercel frontend at the Render URL using `VITE_API_URL`.

---

## Prerequisites

- GitHub repo with your PocketProf code (including the `backend/` folder).
- [Render](https://render.com) account (sign up with GitHub).
- Your API keys ready: **Smallest.ai** and **Google Gemini** (see `backend/.env.example`).

---

## Step 1: Create a new Web Service

1. Go to [dashboard.render.com](https://dashboard.render.com) and log in.
2. Click **New +** (top right) → **Web Service**.
3. If prompted, **Connect a repository**:
   - Choose **GitHub** and authorize Render if needed.
   - Find and select the repo that contains PocketProf (e.g. `voice-hackathon`).
   - Click **Connect**.

---

## Step 2: Configure the service

On the “Create a new Web Service” page, set these exactly:

| Field | Value |
|-------|--------|
| **Name** | e.g. `pocketprof-api` (any name you like; it becomes part of the URL). |
| **Region** | Pick the one closest to you or your users. |
| **Branch** | `main` (or the branch you deploy from). |
| **Root Directory** | **`backend`** ← important: Render must build from the `backend` folder. |
| **Runtime** | **Python 3**. |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

Notes:

- Render sets **`PORT`** automatically; your app must use it (hence `--port $PORT`).
- Leave **Instance Type** as **Free** if you’re okay with cold starts; upgrade later if needed.

---

## Step 3: Add environment variables

Still on the same page, scroll to **Environment Variables** → **Add Environment Variable**. Add these (use **Secret** for keys):

| Key | Value | Secret? |
|-----|--------|--------|
| `SMALLEST_API_KEY` | Your Smallest.ai API key | Yes |
| `GEMINI_API_KEY` | Your Google Gemini API key | Yes |
| `SMALLEST_VOICE_ID` | `sophia` (or another default) | No |
| `APP_ENV` | `production` | No |

Optional (only if you need to override defaults):

| Key | Value |
|-----|--------|
| `LIGHTNING_API_URL` | `https://waves-api.smallest.ai/api/v1/lightning-v3.1/stream` |
| `LIGHTNING_MODEL` | `lightning` |
| `LIGHTNING_SAMPLE_RATE` | `24000` |
| `LIGHTNING_OUTPUT_FORMAT` | `pcm` |

Do **not** set `PORT` — Render provides it.

---

## Step 4: Create the Web Service

1. Click **Create Web Service** at the bottom.
2. Render will clone the repo, run the build command in `backend/`, then start the app with the start command.
3. Watch the **Logs** tab. The first deploy can take a few minutes.
4. When it succeeds, you’ll see a URL at the top, e.g. **`https://pocketprof-api.onrender.com`**. Copy it.

---

## Step 5: Verify the backend

1. Open **`https://<your-service-name>.onrender.com/docs`** in a browser. You should see FastAPI’s Swagger UI.
2. Open **`https://<your-service-name>.onrender.com/health`**. You should get a healthy response.

If either fails, check the **Logs** tab for errors (e.g. missing env var or wrong start command).

---

## Step 6: Connect your frontend (Vercel)

1. In [Vercel](https://vercel.com), open your frontend project → **Settings** → **Environment Variables**.
2. Add:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://<your-service-name>.onrender.com` (your Render URL, no trailing slash).
3. **Redeploy** the frontend so the new variable is used in the build.

Your Vercel app will now call the Render backend for “Play sample”, transcription, TTS, and Ask.

---

## Step 7: (Optional) Custom domain on Render

- In Render: open your Web Service → **Settings** → **Custom Domain**.
- Add your domain and follow the DNS instructions.
- If you use a custom domain, set **`VITE_API_URL`** on Vercel to that URL instead of `*.onrender.com`.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Build fails | **Logs** tab: ensure **Root Directory** is `backend` and `pip install -r requirements.txt` runs there. |
| “Application failed to respond” | Start command must be `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. |
| CORS errors from Vercel | Backend CORS already allows `*.vercel.app` (see `backend/app/main.py`). Redeploy backend after any CORS change. |
| 503 or timeouts | Free tier sleeps after inactivity; first request can be slow. Consider upgrading instance if needed. |
| Missing API key errors | In Render → **Environment**: confirm `SMALLEST_API_KEY` and `GEMINI_API_KEY` are set and marked **Secret** if desired. |

---

## Quick reference

- **Render dashboard:** [dashboard.render.com](https://dashboard.render.com)
- **Backend URL:** `https://<your-service-name>.onrender.com`
- **API docs:** `https://<your-service-name>.onrender.com/docs`
- **Frontend env:** `VITE_API_URL` = backend URL (no trailing slash)
