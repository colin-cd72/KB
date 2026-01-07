#!/bin/bash

# Auto-deploy script for KB system
# Triggered by GitHub webhook

set -e

# Navigate to project directory
cd /home/knowledge/htdocs/kb.4tmrw.net

echo "$(date): Starting deployment..."

# Pull latest changes
echo "Pulling from git..."
git pull origin main

# Check if backend dependencies changed
if git diff HEAD~1 --name-only | grep -q "backend/package"; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

# Check if frontend changed
if git diff HEAD~1 --name-only | grep -q "frontend/"; then
    echo "Building frontend..."
    cd frontend && npm install && npm run build && cd ..
fi

# Restart backend with PM2
echo "Restarting backend..."
pm2 restart kb-backend || pm2 start backend/src/server.js --name kb-backend

echo "$(date): Deployment complete!"
