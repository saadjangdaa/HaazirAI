# Haazir AI — حاضر AI
### "Jo bhi chahiye, Haazir hai"
**Pakistan's Agentic Home Services Orchestrator**
*Google Antigravity Hackathon — Challenge 2: AI Service Orchestrator for Informal Economy*

---

## Architecture

```
User (Urdu / Roman Urdu / English)
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   React Native Expo App                  │
│  Home → Results → Booking → Tracking → Feedback         │
│  (AgentLogViewer shows full reasoning trace for judges)  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS (Axios, 45s timeout, 2 retries)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI Backend (Cloud Run)                  │
│  /api/request  /api/bid  /api/book  /api/dispute         │
│  /api/booking/{id}  /api/logs/{id}  /api/feedback        │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │   Antigravity Orchestrator │
         └─────────────┬─────────────┘
                       │
    ┌──────────────────▼──────────────────┐
    │                                      │
    ▼          ▼        ▼        ▼        ▼
 SAMAJH   DHUNDHO  CHUNNO  HIFAZAT  HISAAB
                                          │
                              ┌───────────┘
                              ▼
                        PAKKA (Booking)
                              │
                     ┌────────┴────────┐
                     │                 │
                  MOLTOL           JHAGRA
               (Negotiate)        (Dispute)
                                      │
                                   REPORT
                                (Analytics)
```

---

## 9 Agents — Detailed

| # | Name | Urdu | Purpose |
|---|------|------|---------|
| 1 | **SAMAJH** | سمجھ | Multilingual NLP — Urdu/Roman Urdu/Punjabi/Sindhi/English/mixed |
| 2 | **DHUNDHO** | ڈھونڈو | Provider discovery from mock DB + Maps API |
| 3 | **CHUNNO** | چُنّو | 8-factor weighted ranking algorithm |
| 4 | **PAKKA** | پکّا | Booking + scheduling intelligence + conflict resolution |
| 5 | **MOLTOL** | مول تول | AI negotiation + order pooling + bid evaluation |
| 6 | **HIFAZAT** | حفاظت | Trust scoring + fraud detection |
| 7 | **HISAAB** | حساب | Dynamic pricing engine with transparency |
| 8 | **JHAGRA** | جھگڑا | Dispute resolution + escalation |
| 9 | **REPORT** | رپورٹ | Daily income reports + demand forecasting |

---

## 8-Factor Ranking Formula (CHUNNO)

```
score = (
  distance_score       × 0.20   # How close is the provider
  rating_score         × 0.20   # Overall star rating (1-5)
  reliability_score    × 0.15   # On-time percentage
  review_recency_score × 0.10   # How recent are positive reviews
  specialization_score × 0.15   # Skill match to job complexity
  price_score          × 0.10   # Closer to user budget = higher
  cancellation_risk    × 0.05   # Lower cancellation rate = better
  capacity_score       × 0.05   # Not overloaded with jobs today
)
```

---

## API Endpoints

| Method | Endpoint | Action |
|--------|----------|--------|
| `POST` | `/api/request` | Full orchestration (all 6 agents) |
| `POST` | `/api/bid` | Trigger MOLTOL negotiation |
| `POST` | `/api/book` | PAKKA booking confirmation |
| `POST` | `/api/dispute` | JHAGRA dispute resolution |
| `GET`  | `/api/booking/{id}` | Booking status + tracking |
| `GET`  | `/api/logs/{request_id}` | Full agent trace logs |
| `GET`  | `/api/provider/report/{id}` | Daily income report |
| `GET`  | `/api/providers` | List all providers (filterable) |
| `POST` | `/api/feedback` | Submit rating + review |
| `GET`  | `/health` | Health check |

---

## Provider Dataset Schema

```json
{
  "id": "p001",
  "name": "Muhammad Ali AC Services",
  "service": "AC technician",
  "specialization": ["AC repair", "AC installation", "gas refill"],
  "complexity_level": "intermediate",
  "city": "Islamabad",
  "area": "G-13",
  "rating": 4.8,
  "review_count": 127,
  "recent_reviews_positive": 0.94,
  "on_time_percentage": 0.91,
  "cancellation_rate": 0.04,
  "available": true,
  "available_slots": ["09:00", "11:00", "14:00", "16:00"],
  "price_per_hour": 800,
  "experience_years": 7,
  "verified": true,
  "trust_score": 0.92,
  "jobs_completed": 340,
  "phone": "03001234567",
  "lat": 33.6844,
  "lng": 73.0479,
  "languages": ["urdu", "punjabi"],
  "tools_available": ["multimeter", "gas_kit", "drill"],
  "pending_earnings": 2400,
  "workload_today": 2
}
```

**40 providers across:**
- Services: AC (8) · Plumber (8) · Electrician (8) · Tutor (6) · Beautician (4) · Carpenter (4) · Painter (2)
- Cities: Karachi (15) · Lahore (15) · Islamabad (10)

---

## Stress Test Scenarios Handled

| # | Scenario | Handler |
|---|----------|---------|
| 1 | No providers available | DHUNDHO → waitlist + next available time |
| 2 | Provider cancels after booking | MOLTOL auto-activates next bid |
| 3 | Low confidence parsing | SAMAJH → clarification in same language |
| 4 | Simultaneous booking conflict | PAKKA → 3 alternate slots suggested |
| 5 | Emergency (gas leak) | All agents → fast-track verified provider |
| 6 | High rating + recent bad reviews | CHUNNO/HIFAZAT → warn customer with data |
| 7 | Price dispute | JHAGRA → compare with Hisaab original quote |
| 8 | Maps API failure | maps.py → fallback to area coordinate lookup |

---

## Antigravity Workflow

```
User says: "AC bilkul kaam nahi kar raha, kal subah G-13 mein chahiye"

SAMAJH  → Detects Roman Urdu, extracts intent (confidence: 0.92)
DHUNDHO → Finds 8 AC technicians in Islamabad near G-13
CHUNNO  → Ranks using 8 factors, warns about 1 provider
HIFAZAT → Trust-checks all, approves 6, warns 2
HISAAB  → Total: Rs 1,580 (base + distance + urgency − loyalty)
PAKKA   → Booking confirmed: HAZ-20250601-A3B4C5
```

All steps logged with: agent_name · start/end time · input_summary
output_summary · decision_made · confidence · fallback_used · time_seconds

---

## Quick Start

### Backend
```bash
cd backend
cp .env.example .env
# Fill in GEMINI_API_KEY (optional — mock mode works without it)
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### Mobile
```bash
cd mobile
npm install
# Set EXPO_PUBLIC_API_URL=http://localhost:8080 in .env
npx expo start
```

### Docker (Cloud Run)
```bash
cd backend
docker build -t haazir-ai .
docker run -p 8080:8080 --env-file .env haazir-ai
```

---

## Pakistani Context

- **Phone numbers:** 03xx-xxxxxxx format
- **Currency:** PKR (Rs)
- **Areas:** G-13, DHA, Gulshan-e-Iqbal, Clifton, Model Town, Gulberg, Bahria Town, F-7, I-8, Saddar
- **Payment:** JazzCash · Easypaisa · Cash
- **Languages:** Urdu · Roman Urdu · Punjabi · Sindhi · English

---

## Privacy Note

All provider data is mock/simulated. Phone numbers, coordinates, and names are fictional and created for demonstration purposes only. No real personal data is collected or stored.

---

## Assumptions & Limitations

- Gemini 2.0 Flash: mocked gracefully when API key not provided — full demo works without real keys
- Google Maps API: mocked with area coordinate lookup table
- Firebase: in-memory mock DB for demo; real Firestore drops in via env vars
- Voice input: simulated (real Speech-to-Text can replace the mock)
- Real-time tracking: step simulation — replace with WebSocket for production
- Payment: UI only — integrate JazzCash/Easypaisa SDK for production

---

*Built for Google Antigravity Hackathon 2025 — Challenge 2: AI Service Orchestrator for Informal Economy*
