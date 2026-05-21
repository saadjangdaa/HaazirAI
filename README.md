# Haazir AI — حاضر AI

### *"Jo bhi chahiye, Haazir hai"*

**Pakistan's First Agentic Home Services Platform**
*Google Antigravity Hackathon 2025 — Challenge 2: AI Service Orchestrator for Informal Economy*

---

## What is Haazir AI?

Haazir AI is a full-stack, production-ready AI platform that connects Pakistani households with local service workers (plumbers, electricians, AC technicians, tutors, beauticians, carpenters, painters, and more) through a multi-agent AI pipeline. Users speak or type in **Roman Urdu, Urdu, Sindhi, Pashto, or Balochi** and the system handles everything autonomously: understanding intent, finding providers, ranking by 8 factors, negotiating price, confirming bookings, resolving disputes, and sending WhatsApp/push notifications.

---

## Overall Design

```
User (Roman Urdu / Urdu / Sindhi / Pashto / Balochi / English)
         │  Voice or Text
         ▼
┌──────────────────────────────────────────────────────────────┐
│              React Native Expo Mobile App                     │
│   Onboarding → Language Select → Home → Results →           │
│   Voice Convo → Booking → Tracking → Dispute → Feedback     │
│   Worker: Jobs → Earnings → Route → Profile                  │
│   (AgentLogViewer: full reasoning trace per request)         │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS — Axios (45s timeout, 2 retries)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│             FastAPI Backend  (Render / Cloud Run)             │
│   /api/request  /api/bid  /api/book  /api/conversation       │
│   /api/dispute  /api/bookings  /api/users/sync  /api/logs    │
│   /api/conversation/negotiate  /api/conversation/book        │
└────────────────────┬─────────────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │  LangGraph Workflow      │
        │  + Google ADK Control   │
        │  Room (HaazirControlRoom│
        └────────────┬────────────┘
                     │
   ┌─────────────────▼──────────────────────────────────┐
   │   9-Agent Pipeline                                   │
   │                                                      │
   │  SAMAJH → DHUNDHO → CHUNNO → HIFAZAT → HISAAB      │
   │       → MOLTOL → PAKKA → JHAGRA → REPORT            │
   │  + BAAT-CHEET (conversation agent — Fatima persona) │
   └────────────────────────────────────────────────────┘
                     │
   ┌─────────────────▼──────────────────────────────────┐
   │   External Integrations                              │
   │   Google Gemini 2.5 Flash (intent + conversation)   │
   │   Google Maps Geocoding (distance ranking)          │
   │   Uplift AI TTS (language-native voice synthesis)   │
   │   Firebase Auth + Firestore (users, bookings, logs) │
   │   Expo Push Notifications / FCM                     │
   │   Twilio WhatsApp (booking confirmations)           │
   └────────────────────────────────────────────────────┘
```

---

## Architecture

### Backend (`backend/`)

```
backend/
├── main.py                   # FastAPI app — all route definitions (30+ endpoints)
├── app.py                    # App factory + lifespan startup
├── graph.py                  # LangGraph StateGraph (SAMAJH→DHUNDHO→CHUNNO→…→PAKKA)
├── config.py                 # Env config (Gemini, Firebase, Maps, Uplift, Twilio)
├── logging_config.py         # Structured logging setup
│
├── agents/
│   ├── samajh.py             # Agent 1: Multilingual intent extraction (Gemini + heuristics)
│   ├── dhundho.py            # Agent 2: Provider discovery — JSON + Maps geocoding
│   ├── chunno.py             # Agent 3: 8-factor provider ranking
│   ├── hifazat.py            # Agent 4: Trust scoring + fraud detection (also dispute eval)
│   ├── hisaab.py             # Agent 5: Dynamic pricing engine
│   ├── moltol.py             # Agent 6: AI negotiation + order pooling
│   ├── pakka.py              # Agent 7: Booking + scheduling (slot conflict check)
│   ├── jhagra.py             # Agent 8: Dispute resolution (Gemini-powered)
│   ├── report.py             # Agent 9: Analytics + earnings reports for workers
│   ├── conversation.py       # BAAT-CHEET: Multi-turn voice convo (Fatima persona)
│   ├── orchestrator.py       # Bidding + provider report orchestration
│   ├── pipeline.py           # Pipeline utilities
│   └── adk_control_room.py   # Google ADK BaseAgent wrapper for full pipeline
│
├── services/
│   ├── gemini.py             # Gemini 2.5 Flash client (key rotation, mock fallback)
│   ├── firebase.py           # Firestore: users, bookings, disputes, agent_logs
│   ├── uplift_tts.py         # Uplift AI TTS — language-specific voice IDs
│   ├── maps.py               # Google Maps Geocoding + Haversine distance
│   ├── voice.py              # Gemini audio transcription (STT)
│   ├── whatsapp.py           # Twilio WhatsApp booking confirmation
│   ├── fcm.py                # Expo Push + FCM notifications
│   ├── push_notify.py        # Notification orchestration (dedup, 90s window)
│   ├── booking_service.py    # Booking status transitions + enrichment
│   ├── dispute_service.py    # Two-sided dispute lifecycle (open→review→resolved)
│   ├── dispute_eligibility.py# No-show grace period, eligibility rules
│   ├── dispute_config.py     # Feature flag: instant vs two-sided resolution
│   ├── trust_service.py      # Provider trust score calculations
│   ├── scheduling.py         # Time preference → scheduled datetime
│   ├── service_categories.py # Service category normalization + intent enrichment
│   ├── worker_service.py     # Worker booking + earnings aggregation
│   ├── user_validation.py    # Phone/CNIC/username normalization + profile checks
│   ├── firestore_schema.py   # Collection constants, normalizers, audit helpers
│   └── adk_runner.py         # ADK runner for LangGraph integration
│
├── orchestration/
│   ├── orchestrator.py       # run_full_orchestration entry point
│   ├── tracer.py             # Per-request agent trace building
│   ├── storage.py            # TraceStorage (in-memory + Firestore)
│   ├── reporter.py           # ZIP report generator (JSON + Markdown trace)
│   └── logger.py             # Orchestration event logger
│
├── models/
│   └── request.py            # All Pydantic request models
│
└── data/
    └── providers.json        # 50+ seed providers across Karachi, Lahore, Islamabad
```

### Mobile (`mobile/`)

```
mobile/
├── app/
│   ├── _layout.tsx           # Root layout — AuthNavigationGuard, routing
│   ├── onboarding.tsx        # First-launch walkthrough
│   ├── language-select.tsx   # Language picker (5 languages)
│   ├── login.tsx             # Firebase email/password login
│   ├── signup.tsx            # Customer signup
│   ├── worker-signup.tsx     # Worker onboarding (skills, areas, pricing)
│   ├── voice-conversation.tsx# Main voice/chat AI screen (Fatima)
│   ├── results.tsx           # Provider search results
│   ├── booking.tsx           # Booking confirmation screen
│   ├── tracking.tsx          # Live job tracking
│   ├── feedback.tsx          # Post-job rating and review
│   ├── dispute.tsx           # File/view dispute
│   ├── nearby.tsx            # Map view of nearby workers
│   ├── agent-traces.tsx      # Judge-facing agent reasoning trace viewer
│   ├── logs.tsx              # Agent log viewer (per request_id)
│   ├── (customer)/
│   │   ├── index.tsx         # Customer home + map + sidebar
│   │   ├── bookings.tsx      # Booking history (active / past)
│   │   ├── disputes.tsx      # Dispute management
│   │   └── profile.tsx       # Profile + language switcher
│   └── (worker)/
│       ├── jobs.tsx          # Worker job queue
│       ├── earnings.tsx      # Earnings dashboard
│       ├── route.tsx         # Route to next job
│       └── disputes.tsx      # Worker dispute responses
│
├── components/
│   ├── AgentLogViewer.tsx    # Expandable agent reasoning cards
│   ├── BiddingPanel.tsx      # Live negotiation UI with provider bids
│   ├── ProviderCard.tsx      # Provider detail card
│   ├── BookingReceipt.tsx    # Booking confirmation receipt
│   ├── PriceBreakdown.tsx    # Hisaab price component
│   ├── CustomerSidebar.tsx   # Slide-in nav drawer
│   ├── FloatingTabBar.tsx    # Customer bottom tab bar
│   ├── WorkerTabBar.tsx      # Worker bottom tab bar
│   ├── MapWrapper.native.tsx # react-native-maps (Android/iOS)
│   └── MapWrapper.web.tsx    # Web fallback map
│
├── context/
│   ├── AuthContext.tsx       # Firebase Auth + profile sync + Firestore direct write
│   ├── LanguageContext.tsx   # AsyncStorage-persisted language + RTL flag + langReady
│   └── MockDataContext.tsx   # Demo mode (sample workers for judges)
│
├── services/
│   ├── api.ts                # Axios client (45s timeout, auto-retry x2)
│   ├── conversationApi.ts    # BAAT-CHEET API calls + local negotiation fallback
│   ├── firebase.ts           # Firebase Web SDK init (Auth + Firestore)
│   ├── voiceRecord.ts        # Expo Audio recording + backend STT
│   ├── voicePlayback.ts      # Base64 audio playback
│   ├── voiceSpeech.ts        # expo-speech fallback TTS
│   ├── authSession.ts        # requireCurrentUser / waitForAuthUser guards
│   └── pushNotifications.ts  # Expo push token registration
│
├── constants/
│   ├── translations.ts       # Full UI translations (5 languages x 50+ strings)
│   └── theme.ts              # Design tokens (colors, spacing, radius, fonts)
│
└── utils/
    ├── profileValidation.ts  # isProfileComplete checks
    ├── disputeEligibility.ts # Client-side eligibility pre-check
    ├── disputeStatus.ts      # Dispute state label helpers
    └── workerBookings.ts     # Worker booking format utilities
```

---

## 9 AI Agents

| # | Name | Urdu | File | What it does |
|---|------|------|------|-------------|
| 1 | **SAMAJH** | سمجھ | `agents/samajh.py` | Multilingual intent extraction — Gemini 2.5 Flash parses noisy Roman Urdu/Urdu/English/Sindhi input into structured JSON (service_type, location, urgency, budget_sensitivity, job_complexity, emergency flag). Falls back to keyword heuristics when Gemini output is unparseable. |
| 2 | **DHUNDHO** | ڈھونڈو | `agents/dhundho.py` | Provider discovery — loads `data/providers.json` (5-min cache), strict service-category matching, Google Maps geocoding for real distance, slot-conflict check against Firestore, returns top 10 candidates. |
| 3 | **CHUNNO** | چُنّو | `agents/chunno.py` | 8-factor ranking — distance, rating, reliability, review recency, specialization match, price, cancellation risk, capacity. Weights shift with urgency and budget_sensitivity. |
| 4 | **HIFAZAT** | حفاظت | `agents/hifazat.py` | Trust + fraud — risk scores for both provider and customer. Actions: APPROVE / APPROVE_WITH_WARNING / MANUAL_REVIEW / BLOCK. Also evaluates disputes using JHAGRA before finalizing. |
| 5 | **HISAAB** | حساب | `agents/hisaab.py` | Dynamic pricing — base rate x complexity multiplier + distance cost + urgency surcharge + surge pricing by city/service/season minus loyalty discount. Returns full price breakdown. |
| 6 | **MOLTOL** | مول تول | `agents/moltol.py` | AI negotiation — simulates real-time bidding from top 5 providers, applies 10-16% discounts, generates Urdu bid messages. `negotiate()` used by `/api/conversation/negotiate`. |
| 7 | **PAKKA** | پکا | `agents/pakka.py` | Booking + scheduling — atomically checks slot conflict, saves to Firestore, calculates reminder times, returns HAZ-{ID} booking reference. |
| 8 | **JHAGRA** | جھگڑا | `agents/jhagra.py` | Dispute resolution — Gemini-powered analysis of dispute type (no_show, quality, price, overrun, cancellation). Returns refund %, provider penalty, escalation flag. |
| 9 | **REPORT** | رپورٹ | `agents/report.py` | Worker analytics — daily earnings, upcoming bookings, demand forecasts by service category and month, performance insights. |
| + | **BAAT-CHEET** | باتیں | `agents/conversation.py` | Multi-turn voice assistant — "Fatima" persona. Manages intake→searching→confirming→booking state machine. Per-language Gemini system prompts. Emits `[SEARCH: ...]` and `[BOOK: ...]` ASCII tags that trigger downstream agent calls. |

### LangGraph Workflow (`graph.py`)

```
START → SAMAJH → (clarification_needed → END)
               → DHUNDHO → CHUNNO → HIFAZAT → HISAAB → MOLTOL → PAKKA → END
```

The `HaazirState` TypedDict carries all state across nodes. The Google ADK `HaazirControlRoom` (`agents/adk_control_room.py`) wraps the entire pipeline as a `BaseAgent` and yields ADK Events per phase.

---

## BAAT-CHEET — Voice Conversation Flow

1. `startConversation(__init__)` → Fatima greets user (language-aware Gemini system prompt)
2. User speaks → `voiceRecord.ts` → `POST /api/voice/transcribe` (Gemini multimodal STT)
3. Text → `POST /api/conversation` → `run_conversation()` manages per-session history
4. When Fatima collects **service + location + urgency** → emits `[SEARCH: service=X location=Y urgency=Z]`
5. Backend triggers `run_samajh_workflow` → top 3 providers returned to frontend
6. User picks provider + states payment method → Fatima emits `[BOOK: provider_id=X payment=Y]`
7. Backend calls Hisaab + Pakka → `booking_result` + WhatsApp sent
8. Every response → `POST /api/voice/tts` (Uplift AI) → `audio_base64` returned inline
9. Frontend plays audio via `voicePlayback.ts`

**Language chain (end-to-end):**
```
AsyncStorage → LanguageContext.language
            → voiceId (VOICE_IDS map in voice-conversation.tsx)
            → sent as voice_id + language in every API call
            → backend: run_conversation(language=...) picks Gemini system prompt
            → backend: tts_translate = (language == 'roman_urdu')
            → Uplift AI uses correct voice agent ID
```

**`langReady` gate:** `startConversation` useEffect has `[langReady]` as dependency — prevents firing before AsyncStorage finishes loading persisted language.

---

## Two-Sided Dispute System

| Phase | Status | Action |
|-------|--------|--------|
| A | `open` | Customer files via `POST /api/dispute` |
| B | `open` | HIFAZAT auto-evaluates eligibility (no-show grace period, booking status) |
| C | `under_review` | Worker responds via `POST /api/dispute/{id}/respond` |
| D | `under_review` | HIFAZAT re-evaluates with worker's response included |
| E | `resolved` | Customer finalizes via `POST /api/dispute/{id}/finalize` — JHAGRA issues verdict (refund %, penalty) |

When `DISPUTE_INSTANT_RESOLVE=true` (env flag), JHAGRA resolves at Phase A immediately (hackathon demo mode).

---

## Real vs Mock APIs

| Service | Real (env key required) | Mock / Fallback behaviour |
|---------|------------------------|--------------------------|
| **Google Gemini 2.5 Flash** | `GOOGLE_GEMINI_API_KEY` | Keyword heuristics (SAMAJH), hardcoded responses elsewhere |
| **Firebase Firestore** | `FIREBASE_PROJECT_ID` + service account | In-memory dict — auto-activates when env missing |
| **Firebase Auth** | Production Firebase project | Always real (client-side) |
| **Uplift AI TTS** | `UPLIFT_AI_API_KEY` | No audio returned — app still works silently |
| **Google Maps Geocoding** | `GOOGLE_MAPS_API_KEY` | City-center coordinates from `CITY_FALLBACK_COORDS` |
| **Twilio WhatsApp** | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | Skipped silently — `whatsapp_sent: false` |
| **Expo Push / FCM** | Real Expo push token from device | Skipped in mock mode |
| **Provider data** | Firestore `providers` collection | `data/providers.json` (50+ seed records) |

> **Firestore persistence:** `AuthContext.tsx` writes `users/{uid}` directly to real Firestore from the mobile client on every signup/login — bypassing the backend's in-memory store and surviving Render cold starts.

---

## Language Support

| Language | Code | Script | Uplift AI Voice ID | TTS Translation |
|----------|------|--------|-------------------|----------------|
| Roman Urdu | `roman_urdu` | Latin | `v_meklc281` | Yes — Gemini converts Roman Urdu → Urdu script before TTS |
| Urdu | `urdu` | Nastaliq | `v_meklc281` | No |
| Sindhi | `sindhi` | Sindhi | `v_sd0kl3m9` | No |
| Pashto | `pashto` | Pashto | `v_meklc281` | No |
| Balochi | `balochi` | Balochi | `v_bl1de2f7` | No |

Per-language Gemini system prompts (`SYSTEM_PROMPTS` dict in `conversation.py`) instruct Fatima to respond in the correct script. The `[SEARCH: ...]` and `[BOOK: ...]` trigger tags are mandated to always remain in plain ASCII regardless of response language.

---

## Complete API Reference

### Core Service Flow

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/request` | Full LangGraph pipeline — SAMAJH→PAKKA. Returns `request_id`, `providers_ranked`, `price_breakdown`, `agent_logs` |
| `POST` | `/api/bid` | MOLTOL negotiation on prior `request_id` (cached result returned if available) |
| `POST` | `/api/book` | PAKKA confirms booking — `provider_id`, `user_id`, `price_accepted` |
| `GET` | `/api/providers` | List providers (`?city=` / `?service=` filters) |
| `GET` | `/api/provider/report/{provider_id}` | REPORT agent analytics for a provider |

### Voice Conversation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/conversation` | BAAT-CHEET turn — Fatima state machine, triggers search/book, returns `audio_base64` |
| `POST` | `/api/conversation/negotiate` | MOLTOL negotiation on session providers |
| `POST` | `/api/conversation/book` | Direct booking from conversation UI (Hisaab + Pakka + WhatsApp) |
| `POST` | `/api/voice/transcribe` | Gemini STT — `audio_base64` → transcript text |
| `POST` | `/api/voice/tts` | Uplift AI TTS — text → `audio_base64` |

### Bookings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/booking/{booking_id}` | Booking detail + enriched provider info |
| `GET` | `/api/booking/{booking_id}/dispute-eligibility` | Phase A eligibility check |
| `GET` | `/api/bookings/user/{user_id}` | All customer bookings |
| `GET` | `/api/bookings/provider/{provider_id}` | All provider bookings |
| `GET` | `/api/bookings/worker/{user_id}` | Worker job queue (resolves provider_id from uid) |
| `PATCH` | `/api/booking/{booking_id}/status` | Update booking status |
| `GET` | `/api/workers/{user_id}/earnings` | Worker earnings summary |

### Disputes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/dispute` | File dispute (Phase A) |
| `GET` | `/api/dispute/{dispute_id}` | Dispute detail |
| `POST` | `/api/dispute/{id}/respond` | Worker response (Phase C) |
| `POST` | `/api/dispute/{id}/finalize` | Customer finalizes — JHAGRA verdict (Phase E) |
| `GET` | `/api/disputes/booking/{booking_id}` | Disputes for a booking |
| `GET` | `/api/disputes/user/{user_id}` | Customer dispute history |
| `GET` | `/api/disputes/worker/{user_id}` | Worker dispute inbox |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/users/sync` | Upsert `users/{uid}` after login/signup |
| `GET` | `/api/users/{user_id}` | Get user profile |
| `POST` | `/api/feedback` | Post-job rating — HIFAZAT updates trust score |

### Observability

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/logs/{request_id}` | Agent reasoning trace (Firestore → memory fallback) |
| `GET` | `/api/report/{request_id}/zip` | Download full orchestration trace as ZIP |
| `GET` | `/health` | Service health — firebase mode, feature flags |

---

## CHUNNO Ranking Formula

Every provider gets a `composite_score`:

```
composite = (
  0.30 x distance_score       +  # proximity (inverted km)
  0.20 x rating_score         +  # stars 1-5 normalized 0-1
  0.15 x reliability_score    +  # on_time_percentage
  0.10 x review_recency       +  # recent_reviews_positive
  0.10 x specialization_score +  # job_complexity match
  0.10 x price_score          +  # lower price = higher score
  0.03 x cancellation_risk    +  # 1 - cancellation_rate
  0.02 x capacity_score          # 1 - (workload_today / 8)
) x trust_multiplier x urgency_weight
```

`urgency_weight`: low=1.0, medium=0.9, high=0.8, critical=0.7 — shifts ranking toward proximity for emergencies.

---

## HISAAB Pricing Formula

```
base_price     = price_per_hour x estimated_hours(complexity)
distance_cost  = distance_km x Rs.20
urgency_adj    = base_price x (urgency_multiplier - 1)
complexity_fee = base_price x (complexity_multiplier - 1)
surge_pricing  = base_price x (surge_factor - 1)   # city + service + season
loyalty_disc   = -10% of subtotal (repeat customers only)
platform_fee   = 10% of total

total = base + distance + urgency + complexity + surge + loyalty + platform_fee
```

Multipliers: urgency critical=2.0 / high=1.2 / medium=1.0 / low=1.0 — complexity complex=1.6 / intermediate=1.3 / basic=1.0.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native + Expo SDK (expo-router file-based routing) |
| Mobile State | React Context (Auth, Language, MockData) + AsyncStorage |
| Backend | Python FastAPI + Uvicorn |
| AI Orchestration | LangGraph `StateGraph` + Google ADK `BaseAgent` |
| LLM | Google Gemini 2.5 Flash with multi-key rotation |
| Database | Firebase Firestore (Admin SDK backend, Web SDK mobile) |
| Auth | Firebase Authentication (email/password) |
| TTS | Uplift AI — language-native Pakistani voices |
| STT | Google Gemini multimodal audio transcription |
| Maps | Google Maps Geocoding API + Haversine distance |
| Push Notifications | Expo Push API + Firebase FCM |
| WhatsApp | Twilio Sandbox API |
| Deployment | Render (backend) + Expo Go / EAS Build (mobile) |

---

## Customer Flow

1. **Onboarding** → **Language Select** (Roman Urdu / Urdu / Sindhi / Pashto / Balochi)
2. **Signup** → Firebase Auth → `writeUserToFirestore` direct + `/api/users/sync` backend
3. **Home** → tap quick service or type request → `POST /api/request` (full pipeline)
   — OR tap **"AI se Baat Karein"** → Voice Conversation screen (Fatima voice agent)
4. **Results** → CHUNNO-ranked providers with HIFAZAT trust badges
5. **Bidding Panel** → MOLTOL negotiation — live bids with Rs. savings
6. **Book** → PAKKA creates booking → WhatsApp + push notification
7. **Track** → live status, provider ETA
8. **Feedback** → star rating + tags → HIFAZAT updates provider trust score
9. **Dispute** (if needed) → two-sided lifecycle → JHAGRA verdict

## Worker Flow

1. **Worker Signup** → skills, service areas, hourly rate, CNIC, phone
2. **Jobs** → active / upcoming bookings queue
3. **Dispute Response** → view open disputes → submit response
4. **Earnings** → REPORT agent: today/week totals, job count, demand forecasts
5. **Route** → navigation to next job

---

## Quick Start

### Backend

```bash
# From repo root
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # Fill in API keys

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
# Health check: http://localhost:8080/health
```

### Mobile

```bash
cd mobile
cp .env.example .env     # Set EXPO_PUBLIC_API_URL to your backend URL
npm install
npx expo start
```

Scan QR with **Expo Go** (Android/iOS). For LAN testing: set `EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:8080`.

### Key Environment Variables

**`backend/.env`**
```env
GOOGLE_GEMINI_API_KEY=...
FIREBASE_PROJECT_ID=...
FIREBASE_CREDENTIALS_PATH=firebase-key.json
GOOGLE_MAPS_API_KEY=...
UPLIFT_AI_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
ENVIRONMENT=production
```

**`mobile/.env`**
```env
EXPO_PUBLIC_API_URL=https://your-render-url.onrender.com
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
```

---

## Hackathon Notes

- **Mock mode auto-activates** when `FIREBASE_PROJECT_ID` or `GOOGLE_GEMINI_API_KEY` are missing — in-memory storage, keyword heuristics, no crashes.
- **Demo Mode toggle** on home sidebar: loads sample worker data from `mockData.ts` for judge demos without live providers.
- **Agent Traces** panel (sidebar): shows full SAMAJH → CHUNNO → HIFAZAT reasoning chain for the last `/api/request` call.
- **5-language UX**: all UI strings (`translations.ts`), Fatima's persona (per-language `SYSTEM_PROMPTS`), and TTS voices switch dynamically — no app restart.
- **Persistent profiles**: `AuthContext.tsx` writes `users/{uid}` directly to real Firestore on signup/login — data survives Render sleep/restart cycles.
- **Service guardrails**: `_normalize_service()` in `main.py` + `_filter_providers_by_service()` ensure the correct service category is always shown — mechanic requests never return plumber results.
