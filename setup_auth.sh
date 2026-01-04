#!/bin/bash

# Setup script for Google OAuth authentication

echo "Setting up Google OAuth authentication..."

# Check if .env.local already exists
if [ -f ".env.local" ]; then
    echo "⚠️  .env.local already exists. Please update it manually with your credentials."
else
    # Create .env.local file template
    cat > .env.local << EOF
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
EOF
    echo "✓ Created .env.local template file"
    echo "⚠️  Please update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET with your actual credentials"
fi

# Install next-auth if not already installed
if ! npm list next-auth > /dev/null 2>&1; then
    echo "Installing next-auth..."
    npm install next-auth
    echo "✓ Installed next-auth"
else
    echo "✓ next-auth is already installed"
fi

echo ""
echo "Setup complete! You need to:"
echo "1. Update .env.local with your Google OAuth credentials from Google Cloud Console"
echo "2. Make sure your Google OAuth redirect URI is set to: http://localhost:3000/api/auth/callback/google"
echo "3. Run 'npm run dev' to start the development server"
echo "4. Visit http://localhost:3000/login to test the authentication"
