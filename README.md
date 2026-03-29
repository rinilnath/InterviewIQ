# InterviewIQ — AI-Powered Interview Management Platform

InterviewIQ is an enterprise-grade, AI-powered interview management platform that generates seniority-calibrated interview question banks with detailed scoring rubrics — powered by Claude AI.

---

## Tech Stack

**Frontend:** React + Vite, Tailwind CSS, Shadcn/ui, Framer Motion, TanStack Query, React Hook Form + Zod, Axios, jsPDF, SheetJS

**Backend:** Node.js + Express, Supabase JS client, JWT Auth, bcryptjs, Multer, pdf-parse, mammoth, Claude API

**Database & Storage:** Supabase PostgreSQL + Supabase Storage

---

## Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Anthropic API key

---

## Setup Steps

### 1. Clone the repository

```bash
git clone <repo-url>
cd interviewiq
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Service Role Key** (Settings → API)

### 3. Run SQL migrations

In your Supabase dashboard, go to the **SQL Editor** and run the contents of:

```
/server/db/migrations.sql
```

This creates the `users`, `documents`, and `interview_kits` tables and seeds the default admin user.

### 4. Create Supabase Storage bucket

In your Supabase dashboard:
1. Go to **Storage**
2. Create a new bucket named: `interviewiq-docs`
3. Set it to **Private** (not public)

### 5. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all values:

```env
# Server
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=interviewiq-docs
JWT_SECRET=your-very-long-random-secret
JWT_EXPIRES_IN=8h
CLAUDE_API_KEY=your-anthropic-api-key
PORT=5000

# Client (Vite)
VITE_API_BASE_URL=http://localhost:5000/api
```

> **Note:** The `VITE_API_BASE_URL` variable needs to go in `client/.env` (create it from `.env.example`).

### 6. Install dependencies

```bash
npm run install:all
```

Or manually:
```bash
# Root
npm install

# Server
cd server && npm install

# Client
cd ../client && npm install
```

### 7. Start development servers

```bash
npm run dev
```

This starts both the backend (port 5000) and frontend (port 5173) simultaneously.

Open **http://localhost:5173** in your browser.

---

## Default Admin Login

```
Email:    admin@interviewiq.com
Password: Admin@123
```

> **Important:** Change this password immediately after your first login via Admin → Users → Reset Password.

---

## Environment Variable Notes

The `.env` file at the root is for the server. For the client, create `client/.env`:

```
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## Generating Your First Kit

1. **Login as admin** at `http://localhost:5173`
2. Go to **Admin → Users** and create user accounts for your team
3. Optionally go to **Admin → Knowledge Base** and upload reference documents (PDF, DOCX, TXT)
4. Login as a user (or stay as admin)
5. Click **Generate Kit** in the sidebar
6. Fill in the Job Description, select seniority level, add tech stack
7. Optionally enable "Use Knowledge Base" to include KB questions (25% of total)
8. Click **Generate Interview Kit** — generation takes 10–15 seconds
9. Score each question using the 1–5 button group
10. Export to **PDF** or **Excel** when complete

---

## Features

### For All Users
- Generate AI-powered interview kits tailored to seniority level and tech stack
- 8 seniority levels from Fresher to CTO with calibrated question complexity
- Expandable answer rubrics (Weak / Average / Strong) for each question
- Real-time scoring (1–5) with automatic overall score calculation
- Save progress and mark interviews as complete
- Export to PDF (formatted A4 rubric sheet) or Excel
- Full interview history with search and filtering

### For Admins
- Complete user management (create, activate/deactivate, reset passwords)
- Knowledge base document management (upload PDF/DOCX/TXT)
- KB documents are automatically incorporated into generated kits (25% of questions)
- View all generated kits across all users

---

## Security

- All Claude API calls on backend only — API keys never exposed to frontend
- Supabase service role key on backend only
- JWT authentication with httpOnly cookies
- Rate limiting: 5 login attempts per 15 minutes, 20 kit generations per hour
- File type validation on upload (PDF, DOCX, TXT only, max 10MB)
- Role-based access control (admin vs user)
- Helmet.js for HTTP security headers

---

## Project Structure

```
interviewiq/
├── client/                    # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── ui/            # Shadcn/ui components
│       │   ├── layout/        # Sidebar, Header, AppShell
│       │   └── auth/          # Login form
│       ├── pages/             # All page components
│       ├── hooks/             # Custom hooks
│       ├── lib/               # API client, utils, queryClient
│       └── store/             # Zustand auth store
├── server/                    # Express backend
│   ├── routes/                # API route handlers
│   ├── middleware/            # Auth, role, upload middleware
│   ├── services/              # Supabase, Claude, document services
│   ├── utils/                 # Prompt builder
│   ├── db/                    # SQL migrations
│   └── server.js              # Entry point
├── .env.example
└── package.json               # Root scripts (concurrently)
```

---

## Seniority Levels & Question Counts

| Level | Questions |
|-------|-----------|
| Fresher (0-1 yr) | 8 |
| Junior Developer (1-3 yrs) | 10 |
| Mid-Level Developer (3-5 yrs) | 12 |
| Senior Developer (5-8 yrs) | 15 |
| Tech Lead (8-12 yrs) | 18 |
| Solution Architect (10-15 yrs) | 20 |
| Enterprise Architect (15-20 yrs) | 22 |
| Technology Head / CTO (20+ yrs) | 25 |
