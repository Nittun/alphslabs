# Quick Authentication Setup Instructions

## ✅ Code Setup Complete!

All authentication code has been set up. You just need to:

## Step 1: Create .env.local File

Create a file named `.env.local` in the root directory (`/Users/nittunlertwirojkul/Downloads/backtest_web/.env.local`) with the following content:

```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000
```

**Quick command to create it:**
```bash
cat > .env.local << 'EOF'
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000
EOF
```

## Step 2: Install next-auth Package

Run this command in your terminal:

```bash
npm install next-auth
```

## Step 3: Verify Google OAuth Redirect URI

Make sure in your Google Cloud Console, the authorized redirect URI includes:
- `http://localhost:3000/api/auth/callback/google`

## Step 4: Start the Application

```bash
npm run dev
```

## Step 5: Test Authentication

1. Visit `http://localhost:3000/login`
2. Click "Sign in with Google"
3. You should be redirected to Google's login page
4. After authentication, you'll be redirected to `/backtest`

## What's Already Set Up

✅ NextAuth API route (`/app/api/auth/[...nextauth]/route.js`)
✅ Login page (`/app/login/page.jsx`)
✅ Session provider in layout
✅ Logout functionality in sidebar
✅ Route protection middleware
✅ User profile display in sidebar

## Troubleshooting

If you get errors:
1. Make sure `.env.local` file exists and has correct values
2. Verify `next-auth` is installed: `npm list next-auth`
3. Check that Google OAuth redirect URI matches exactly
4. Restart the dev server after creating `.env.local`

