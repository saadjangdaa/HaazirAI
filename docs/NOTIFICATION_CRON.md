# Scheduled booking reminders (Phase 6)

Reminders are stored in Firestore `notifications/` with `sent: false` and a future `send_at`.
They are delivered when something calls `process_pending_notifications()`.

## Production (Render / any host)

1. Set environment variable on the backend service:
   ```
   CRON_SECRET=<long-random-string>
   ```
2. Create a cron job (every **5–15 minutes**):
   - **POST** `https://YOUR-BACKEND/api/cron/process-notifications`
   - Header: `X-Cron-Secret: <same CRON_SECRET>`
3. Optional health check: `GET /health` → `features.notification_reminder_cron: true`

### Render Cron Job example

- Schedule: `*/10 * * * *` (every 10 minutes)
- Command (if using Render native cron against your service URL):
  ```bash
  curl -sS -X POST "$RENDER_EXTERNAL_URL/api/cron/process-notifications" \
    -H "X-Cron-Secret: $CRON_SECRET"
  ```

## Development

```bash
curl -X POST http://localhost:8080/api/admin/process-notifications
```

(Only when `ENVIRONMENT=development`.)

## Optional single-instance loop

Only if you run **one** backend instance (not recommended on multi-instance Render):

```
CRON_SECRET=...
NOTIFICATION_CRON_INTERNAL=true
NOTIFICATION_CRON_INTERVAL_SECONDS=300
```

## Mobile

Reminder pushes use `event_type: reminder` → customer **tracking** screen when tapped.
