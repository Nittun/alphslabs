# Vercel Production Deployment Guide

This guide walks you through deploying Alphalabs to Vercel for production.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         USERS                                │
│                           ↓                                  │
├─────────────────────────────────────────────────────────────┤
│                      VERCEL                                  │
│              (Next.js Frontend)                              │
│         https://your-app.vercel.app                          │
│                     ↓         ↓                              │
├─────────────────────────────────────────────────────────────┤
│     ↓                                    ↓                   │
│  RAILWAY                            AWS RDS                  │
│  (Python Flask API)              (PostgreSQL DB)             │
│  https://api.railway.app        alphalabs-db.us-east-2      │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Deploy Flask API to Railway (Free Tier Available)

Since Vercel doesn't run Python Flask, you need to host the API separately.

### 1.1 Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### 1.2 Prepare API for Railway

Create a `Procfile` in your project root:
```
web: python backtest_api.py
```

Create a `railway.json` in your project root:
```json
{
  "build": {
    "builder": "nixpacks"
  },
  "deploy": {
    "startCommand": "python backtest_api.py",
    "healthcheckPath": "/api/health"
  }
}
```

Update `backtest_api.py` to use environment variable for port:
```python
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
```

### 1.3 Deploy to Railway
1. Go to Railway dashboard → New Project → Deploy from GitHub
2. Select your repository
3. Railway will auto-detect Python and deploy
4. Go to Settings → Generate Domain
5. Copy your Railway URL (e.g., `https://alphalabs-api-production.up.railway.app`)

## Step 2: Deploy Next.js to Vercel

### 2.1 Connect to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click "New Project"
4. Import your GitHub repository

### 2.2 Configure Environment Variables

In Vercel project settings → Environment Variables, add:

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://your-railway-app.up.railway.app` | Your Railway Flask API URL |
| `NEXTAUTH_URL` | `https://your-vercel-app.vercel.app` | Your Vercel production URL |
| `NEXTAUTH_SECRET` | `your-secret-here` | Generate with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | `your-client-id` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `your-secret` | From Google Cloud Console |
| `DATABASE_URL` | `postgresql://...` | Your AWS RDS connection string |

### 2.3 Important: Update Google OAuth

Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials:

1. Edit your OAuth 2.0 Client ID
2. Add your production redirect URI:
   ```
   https://your-vercel-app.vercel.app/api/auth/callback/google
   ```

### 2.4 Deploy
1. Push your code to GitHub
2. Vercel will automatically deploy

## Step 3: Verify Deployment

### Check List:
- [ ] Flask API health check: `https://your-railway-app.up.railway.app/api/health`
- [ ] Vercel site loads: `https://your-vercel-app.vercel.app`
- [ ] Google login works
- [ ] Database connection shows "Connected" on Connections page
- [ ] Backtest runs successfully

## Environment Variables Summary

### For Vercel (Production)
```env
# API URL (your Railway deployment)
NEXT_PUBLIC_API_URL=https://your-railway-app.up.railway.app

# NextAuth (update URL to your production domain)
NEXTAUTH_URL=https://your-vercel-app.vercel.app
NEXTAUTH_SECRET=your-generated-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Database (your AWS RDS)
DATABASE_URL=postgresql://postgres:password@your-rds-endpoint.us-east-2.rds.amazonaws.com:5432/postgres
```

### For Railway (Flask API)
```env
# Railway automatically sets PORT, no additional config needed
# Optional: Add any API-specific env vars here
```

## Alternative: Deploy Flask to Render

If you prefer Render over Railway:

1. Go to [render.com](https://render.com)
2. New → Web Service → Connect GitHub
3. Environment: Python
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `python backtest_api.py`
6. Add environment variable: `PORT=10000` (Render uses 10000)

## Troubleshooting

### "API server not connected"
- Check if Railway/Render deployment is running
- Verify `NEXT_PUBLIC_API_URL` in Vercel env vars
- Check Railway/Render logs for errors

### "Database not connected"
- Verify `DATABASE_URL` in Vercel env vars
- Check AWS RDS security group allows connections from anywhere (for production, consider VPC peering)
- Run `npx prisma db push` locally first to ensure schema is up to date

### "Google login fails"
- Verify redirect URIs in Google Cloud Console include your production URL
- Check `NEXTAUTH_URL` matches your Vercel deployment URL exactly

### CORS errors
- Flask API already has CORS enabled for all origins
- If issues persist, check Railway/Render logs

## Cost Estimates

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| Vercel | 100GB bandwidth/month | $20/month (Pro) |
| Railway | $5 credit/month | Pay as you go |
| AWS RDS | 750 hrs/month (12 months) | ~$15-25/month |

## Security Reminders

1. **Never commit `.env` or `.env.local` files**
2. **Use strong, unique secrets** for `NEXTAUTH_SECRET`
3. **Restrict AWS RDS access** in production (use VPC, specific IPs)
4. **Enable 2FA** on all cloud provider accounts
5. **Rotate secrets periodically**

