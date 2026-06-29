# 🚀 Deploying Pawvy to Railway (Cloud)

Once deployed, Pawvy will be accessible from **any device, anywhere** — your phone at a partner's shop, your laptop in JB, your partner's computer. No need to keep your laptop on at home.

---

## What You'll Need
- A **GitHub account** (free) — github.com
- A **Railway account** (free tier works) — railway.app
- **Git** installed on your Windows PC
- ~20 minutes

---

## Part 1 — Install Git (one time)

1. Go to **https://git-scm.com/download/win**
2. Download the installer and run it (keep all default settings)
3. Open a new Command Prompt and type `git --version` — should show something like `git version 2.x.x`

---

## Part 2 — Create a GitHub Repository

1. Go to **https://github.com** and sign in (or create a free account)
2. Click the **+** button (top right) → **New repository**
3. Name it: `pawvy-app`
4. Set to **Private** (important — this is your business data)
5. Click **Create repository**
6. GitHub shows you a page with setup commands — keep this tab open

---

## Part 3 — Push Your Code to GitHub

Open Command Prompt in your `pawvy-app` folder:

```
cd "C:\Users\KT\Downloads\Pawvy App\pawvy-app"
```

Then run these commands one by one:

```
git init
git add .
git commit -m "Initial Pawvy app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pawvy-app.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

When prompted, enter your GitHub username and password (or personal access token — GitHub may guide you through this).

✅ Your code is now on GitHub.

---

## Part 4 — Create Railway Account

1. Go to **https://railway.app**
2. Click **Login** → **Login with GitHub**
3. Authorise Railway to access your GitHub
4. You're in — Railway dashboard opens

---

## Part 5 — Deploy from GitHub

1. In Railway dashboard, click **New Project**
2. Select **Deploy from GitHub repo**
3. Find and select `pawvy-app`
4. Railway automatically detects the config and starts building

The first build takes 3–5 minutes (installing packages, building the frontend).

---

## Part 6 — Set Up Persistent Storage (CRITICAL)

Without this step, your data resets every time Railway restarts. Don't skip this.

### 6a — Create a Volume

1. In your Railway project, click **+ New** → **Volume**
2. Name it: `pawvy-data`
3. Click **Create**

### 6b — Attach Volume to Your App

1. Click on your `pawvy-app` service
2. Go to the **Settings** tab
3. Scroll to **Volumes** section
4. Click **Add Volume Mount**
5. Select `pawvy-data`
6. Set Mount Path: `/data`
7. Click **Save**

### 6c — Set Environment Variables

Still in your `pawvy-app` service → **Variables** tab:

Click **New Variable** and add:

| Variable | Value |
|---|---|
| `DATABASE_PATH` | `/data/pawvy.db` |
| `NODE_ENV` | `production` |

Click **Save** — Railway will automatically redeploy.

---

## Part 7 — Get Your Public URL

1. Click on your `pawvy-app` service
2. Go to **Settings** → **Networking**
3. Click **Generate Domain**
4. You'll get a URL like: `https://pawvy-app-production-xxxx.up.railway.app`

**Open that URL in any browser, on any device. Pawvy is live! 🎉**

---

## Part 8 — Bookmark It

On your **phone**:
- Open Chrome → go to your Railway URL
- Tap the menu (⋮) → **Add to Home Screen**
- It will appear like an app icon on your phone

On your **laptop**:
- Bookmark the Railway URL in Chrome/Edge

---

## Keeping Your Local Copy

Your Windows laptop version (`START.bat`) still works exactly as before — it uses the local database (`data/pawvy.db`). 

**Important: the local and cloud databases are SEPARATE.** Data entered locally doesn't sync to Railway and vice versa. Going forward, pick one as your primary:

- **Recommended: Use Railway as primary** (access from everywhere, data in one place)
- Use local only as a backup or offline fallback

---

## Updating the App Later

When we make improvements to the app in future sessions, updating Railway is simple:

```
git add .
git commit -m "Update description here"
git push
```

Railway auto-detects the push and redeploys automatically (takes ~2 minutes). Your data on the persistent volume is untouched.

---

## Cost

Railway's **Hobby plan** costs $5/month and includes:
- A small Node.js server (Pawvy uses ~50–100MB RAM)
- Volume storage (your database will be <10MB for years)
- Estimated actual usage cost: **$2–3/month** (well within the $5 credit)

There's also a free trial period to test it out first.

---

## Troubleshooting

**Build fails:** Check the build logs in Railway for error details. Most common cause is a missing file — let me know and I'll fix it.

**"Application failed to respond":** The server crashed. Check **Logs** tab in Railway. Send me a screenshot and I'll diagnose.

**Data not saving:** Check that the volume is mounted at `/data` and `DATABASE_PATH=/data/pawvy.db` is set.

**Forgot your Railway URL:** It's in Railway dashboard → your project → your service → Settings → Networking.
