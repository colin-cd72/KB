#!/bin/bash

# Auto-deploy script for KB system
# Triggered by GitHub webhook

set -e

# Navigate to project directory
cd /home/knowledge/htdocs/kb.4tmrw.net

echo "$(date): Starting deployment..."

# Discard npm-induced drift to package files so `git pull` can't be blocked.
# `npm install` on the server rewrites package.json / package-lock.json (e.g.
# axios caret bumps); those local edits otherwise abort the pull.
git checkout -- backend/package.json backend/package-lock.json \
                frontend/package.json frontend/package-lock.json 2>/dev/null || true

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

# Restart backend with PM2. The process is named "kb" (not "kb-backend");
# targeting the wrong name starts a duplicate that dies on the port conflict
# and leaves the real process running stale code.
echo "Restarting backend..."
pm2 restart kb --update-env || pm2 start backend/src/server.js --name kb

echo "$(date): Deployment complete!"
