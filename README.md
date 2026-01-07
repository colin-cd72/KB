# Knowledge Base System

A comprehensive troubleshooting knowledge base with AI-powered search, user manual repository, and equipment tracking.

**Live URL:** https://kb.4tmrw.net
**Port:** 5105

## Features

- **Issue Tracking:** Document problems with descriptions, priorities, and categories
- **Solutions Management:** Rate and accept solutions with version history
- **User Manual Repository:** Upload PDFs with automatic text extraction for AI search
- **AI-Powered Search:** Claude-powered intelligent search through manuals and issues
- **Equipment Registry:** Track equipment with QR codes for quick issue lookup
- **User Roles:** Admin, Technician, and Viewer access levels
- **Dashboard & Analytics:** Monitor issue trends and resolution times

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** React + Tailwind CSS
- **Database:** PostgreSQL
- **AI:** Claude API (Anthropic)

## Quick Start

### 1. Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Claude API key from [Anthropic Console](https://console.anthropic.com/)

### 2. Database Setup

```bash
# Create database
createdb kb_database

# Or using psql
psql -U postgres -c "CREATE DATABASE kb_database;"
```

### 3. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your settings:
# - DATABASE_URL: Your PostgreSQL connection string
# - JWT_SECRET: A secure random string
# - CLAUDE_API_KEY: Your Anthropic API key

# Run database migrations
npm run migrate

# Seed initial data (creates admin user)
npm run seed

# Start server
npm run dev
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 5. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5105

**Default Admin Credentials:**
- Email: admin@kb.local
- Password: admin123
- **CHANGE THIS IMMEDIATELY!**

## CloudPanel Deployment

### 1. Create Node.js Application

1. In CloudPanel, create a new Node.js application
2. Set the domain to `kb.4tmrw.net`
3. Set the Node.js version to 18+

### 2. Upload Files

Upload the entire project to `/home/username/htdocs/kb.4tmrw.net/`

### 3. Build Frontend

```bash
cd frontend
npm install
npm run build
```

### 4. Configure Backend

```bash
cd backend
npm install

# Copy and configure .env
cp .env.example .env
nano .env
```

Set these production values:
```
DATABASE_URL=postgresql://username:password@localhost:5432/kb_database
JWT_SECRET=your-production-secret-key
CLAUDE_API_KEY=your-api-key
PORT=5105
NODE_ENV=production
FRONTEND_URL=https://kb.4tmrw.net
```

### 5. Setup PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start the backend
pm2 start backend/src/server.js --name kb-backend

# Save PM2 configuration
pm2 save
pm2 startup
```

### 6. Configure Nginx Reverse Proxy

Add to your site's Nginx configuration:

```nginx
location / {
    root /home/username/htdocs/kb.4tmrw.net/frontend/dist;
    try_files $uri $uri/ /index.html;
}

location /api {
    proxy_pass http://127.0.0.1:5105;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_cache_bypass $http_upgrade;
}

location /uploads {
    alias /home/username/htdocs/kb.4tmrw.net/backend/uploads;
}
```

### 7. SSL Certificate

CloudPanel should automatically handle SSL. Ensure the certificate is active for kb.4tmrw.net.

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register
- `GET /api/auth/me` - Get current user

### Issues
- `GET /api/issues` - List issues
- `POST /api/issues` - Create issue
- `GET /api/issues/:id` - Get issue
- `PUT /api/issues/:id` - Update issue
- `DELETE /api/issues/:id` - Delete issue

### Solutions
- `GET /api/solutions/issue/:id` - Get solutions for issue
- `POST /api/solutions` - Add solution
- `POST /api/solutions/:id/accept` - Accept solution
- `POST /api/solutions/:id/rate` - Rate solution

### Manuals
- `GET /api/manuals` - List manuals
- `POST /api/manuals` - Upload manual (multipart/form-data)
- `GET /api/manuals/:id/search` - Search within manual

### Equipment
- `GET /api/equipment` - List equipment
- `GET /api/equipment/qr/:code` - Get by QR code
- `POST /api/equipment` - Add equipment

### Search
- `GET /api/search` - Global search
- `POST /api/search/ai` - AI-powered search

### Dashboard
- `GET /api/dashboard/stats` - Get statistics
- `GET /api/dashboard/analytics` - Get analytics (admin)

## Project Structure

```
kb-system/
├── backend/
│   ├── src/
│   │   ├── config/          # Database, migrations
│   │   ├── controllers/     # Route handlers
│   │   ├── middleware/      # Auth, error handling
│   │   ├── routes/          # API routes
│   │   └── services/        # Claude AI, PDF parsing
│   ├── uploads/             # File storage
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API calls
│   │   └── store/           # State management
│   └── package.json
└── README.md
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure database exists

### API Errors
- Check backend logs: `pm2 logs kb-backend`
- Verify JWT_SECRET is set
- Check CLAUDE_API_KEY is valid

### Frontend Build Issues
- Clear node_modules and reinstall
- Check Node.js version (18+)

## License

Internal use only - TMRW Sports
