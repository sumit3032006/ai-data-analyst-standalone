# AI Data Analyst: free setup (no n8n)

Architecture:

```
Browser (Cloudflare Pages, free)  --->  FastAPI backend (Render, free)  --->  Gmail SMTP (free, app password)
  site/                                   backend/                              optional: OpenRouter AI
```

Cost: $0 with the free tiers below. Nothing runs on your laptop once deployed.

## 1. Price check (what is free and what limits apply)

| Service | Used for | Free tier | Limits you should know |
|---|---|---|---|
| Cloudflare Pages | Website | Yes | No sleeping. Generous limits for a site like this. |
| Render (web service) | Backend API | Yes | Sleeps after about 15 minutes idle. First request can take about a minute. No persistent disk. Monthly hour cap. |
| Gmail SMTP | Sending the report email | Yes | Requires 2-Step Verification and an app password. Consumer Gmail has a daily sending limit (check Google's current number). |
| OpenRouter | Optional AI insights | Free models exist | Rate-limited, and the free model list changes. Leave AI empty to turn it off. |
| GitHub | Code hosting | Yes | Private repos are free. |

Nothing here promises 24/7 availability. Check each provider's pricing page before you rely on it.

## 2. Put the code on GitHub

```powershell
cd C:\Projects\ai-data-analyst-standalone
git init
git add .
git commit -m "Standalone version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ai-data-analyst.git
git push -u origin main
```

Create the empty repository on github.com first (Private, no README). The `.gitignore` keeps `.env` files out of Git.

## 3. Create the Gmail app password (free, one time)

1. Sign in to ai.data.analyst.reports@gmail.com.
2. Turn on 2-Step Verification at myaccount.google.com/security.
3. Go to myaccount.google.com/apppasswords, create an app password named `ai-data-analyst`.
4. Copy the 16-character password. Paste it into Render as `GMAIL_APP_PASSWORD`. Never put it in any file or in the website.

## 4. Deploy the backend on Render

1. Sign up at render.com with GitHub.
2. New > Web Service > select the repository.
3. Settings:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health Check Path: `/health`
   - Instance Type: Free
4. Environment tab. Add:

| Key | Value |
|---|---|
| PYTHON_VERSION | 3.12.7 |
| APP_SECRET | a long random string (generate below) |
| ALLOWED_ORIGINS | your Pages URL, e.g. `https://ai-data-analyst.pages.dev` (add after step 5 if needed) |
| GMAIL_ADDRESS | ai.data.analyst.reports@gmail.com |
| GMAIL_APP_PASSWORD | the 16-character app password |
| MAX_UPLOAD_MB | 20 |
| DAILY_EMAIL_LIMIT | 40 |
| OPENROUTER_API_KEY | optional |
| AI_MODEL | optional; leave empty to keep AI off |

Generate `APP_SECRET`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

5. Create the service and wait for the build. Open `https://YOUR-API.onrender.com/health`. Expected: `{"status":"ok"}`.

## 5. Deploy the website on Cloudflare Pages

1. Sign up at dash.cloudflare.com.
2. Workers & Pages > Create > Pages > Connect to Git > select the repository.
3. Build command: leave empty. Build output directory: `site`.
4. Before deploying, edit these in your repo:
   - `site/app.js`: set `API_BASE_URL` to your Render URL (no trailing slash).
   - `site/_headers`: replace `https://your-api.onrender.com` in `connect-src` with the same URL.
5. Commit and push. Your site is at `https://PROJECT.pages.dev`.
6. Go back to Render and set `ALLOWED_ORIGINS` to that exact URL. Render restarts the service automatically.

## 6. Test

1. Open your Pages site. Upload this as `test-sales.csv`:

```
region,sales
North,1200
South,800
East,500
North,300
```

2. Ask: `What are the total sales by region?` Click Analyze Data.
3. Expected: total 2800; North 1500 (53.57%), South 800 (28.57%), East 500 (17.86%). The first run can take a minute.
4. Enter your own email under "Email this report" and click Send Report. You should see "Delivered to ...". Check your inbox and spam folder.
5. Negative tests: upload a `.txt` file (expect "not supported"); send to an invalid address (expect a validation message).

## 7. Security: what this version does and does not protect

Built in:
- File type, size, row, and column limits. Excel files are checked for their real format.
- Rate limits: 10 analyses per 10 minutes per IP, 5 emails per hour per IP, and a global daily email cap (`DAILY_EMAIL_LIMIT`).
- The email endpoint only sends results that the server itself produced and signed in the last 6 hours. Someone cannot use the server to send arbitrary text, and no HTML from the browser is trusted.
- All user text in emails is HTML-escaped.
- CORS is limited to `ALLOWED_ORIGINS`. The password and API keys are server-only.

Not solved (be aware):
- The `/analyze` endpoint is public. Anyone can upload files to it, up to the rate limit. The rate limits live in memory, so they reset when the server restarts and do not share across instances. This is fine for a free, single-instance service, but it is not strong protection.
- A determined person can still send emails to a recipient of their choice, up to the limits above. Because the sender is your Gmail account, abuse could get the account flagged. Consider restricting recipients to a list you control before publishing widely.
- Sharing the Pages URL publicly invites use. Keep the URL private if you want to limit traffic.

## 8. Not included yet

- PDF and Excel report files (the download buttons export CSV and JSON; the email attaches CSV).
- Input types beyond CSV, XLSX, XLS, and JSON.
- History, Settings, dark mode.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Set CONFIG... API_BASE_URL" | Placeholder still in app.js | Edit `site/app.js` and push |
| CORS error in console | Pages URL not in `ALLOWED_ORIGINS` | Set the exact URL and let Render restart |
| CSP error in console | Render URL missing from `_headers` | Edit `site/_headers` and push |
| "Server is not configured: APP_SECRET" | Variable not set | Add it on Render |
| "Email is not configured" | GMAIL vars missing | Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD |
| "Email could not be sent" | Wrong app password, 2-Step off, or daily limit reached | Regenerate the app password; wait a day if the limit was hit |
| "result could not be verified" / "expired" | Result is older than 6 hours or the server restarted with a different secret | Run the analysis again |
| "Too many requests" | Rate limit reached | Wait and retry |
| Very slow first request | Render free tier waking up | Wait a minute |
