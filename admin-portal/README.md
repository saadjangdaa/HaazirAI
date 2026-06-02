# Haazir Dost — Admin Management Portal

Separate React admin app for provider approval, disputes, analytics, admin users, and audit logs.

**Not included:** messaging, SMS/email/WhatsApp, worker dashboard, payments, or settings.

## How to run (step by step)

### Terminal 1 — Backend

From repo root `c:\GIT-DESKTOP\HaazirAI`:

```powershell
cd c:\GIT-DESKTOP\HaazirAI

# One-time: copy and edit backend env (Firebase optional in dev — uses mock DB)
copy backend\.env.example backend\.env

# Start API
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

Check: open http://localhost:8080/health — should return `"status": "ok"`.

Optional — seed demo providers (development only):

```powershell
curl -X POST http://localhost:8080/api/admin/seed-providers
```

### Terminal 2 — Admin portal

```powershell
cd c:\GIT-DESKTOP\HaazirAI\admin-portal

npm install
copy .env.example .env
npm run dev
```

Open **http://localhost:5174**

### Login (development)

1. On the login page, leave **email and password empty**.
2. Click **Sign in** (uses dev admin `dev_super_admin` — created automatically in Firestore/mock on backend start).
3. You should land on the dashboard.

If login fails, confirm backend is running and `.env` has:

```
VITE_DEV_LOGIN=true
VITE_ADMIN_DEV_UID=dev_super_admin
```

### Production login

1. Create a Firebase Auth user for the admin.
2. In Firestore, document `admin_users/{that_firebase_uid}` with fields: `email`, `name`, `role` (`super_admin`, etc.), `active: true`.
3. Set `VITE_FIREBASE_API_KEY` (and related) in `admin-portal/.env`, set `VITE_DEV_LOGIN=false`.
4. Sign in with email/password on the login page.

## Development auth

1. Backend seeds `admin_users/dev_super_admin` when the collection is empty (`ENVIRONMENT=development`).
2. Portal: leave login empty (no `VITE_FIREBASE_API_KEY`) → uses `VITE_ADMIN_DEV_UID` / `X-Admin-Uid` header.
3. Production: set Firebase web config in `.env`, create admin docs in Firestore `admin_users/{firebase_uid}` with `role` and `active: true`.

## API routes (prefix `/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Metrics + recent activity |
| GET/PATCH/DELETE | `/providers`, `/providers/{id}/approve|reject|suspend|activate` | Provider management |
| GET/PATCH | `/disputes`, `/disputes/{id}/resolve` | Disputes |
| GET | `/analytics/all` | Analytics |
| GET/POST/PATCH/DELETE | `/users` | Admin users (super_admin) |
| GET | `/audit-log` | Audit trail |

Legacy dev tools (`/api/admin/verify-*`, `seed-providers`) remain in `main.py` unchanged.

## Roles (RBAC)

- **super_admin** — full access
- **provider_manager** — providers (write)
- **dispute_manager** — disputes (write)
- **analytics_manager** — analytics (read)
- **viewer** — read-only all sections

## Firestore collections (new)

- `admin_users/{uid}` — `email`, `name`, `role`, `active`
- `audit_logs/{log_id}` — admin actions

Provider docs use optional `admin_status`, `documents`, `suspend_reason`, etc.
