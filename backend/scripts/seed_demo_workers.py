"""
Haazir AI — Demo Worker Account Seeder

Creates demo worker accounts in Firebase Auth + Firestore.
Uses Firebase REST API only — no firebase-admin or credentials file needed.

Usage:
    pip install requests
    python backend/scripts/seed_demo_workers.py

Password for ALL accounts: Haazir@123

--- KARACHI ---
Clifton:
    ac.karachi@demo.haazir.pk           Saad AC Technician (p028)
    electric.karachi@demo.haazir.pk     Rizwan Electricals (p031)
    beauty.clifton.khi@demo.haazir.pk   Zainab Home Salon  (p037)

Defence / DHA:
    ac.dha.khi@demo.haazir.pk           Hamza AC Services  (p026)
    plumber.dha.khi@demo.haazir.pk      Khalid Plumbing    (p029)

Gulshan-e-Iqbal:
    ac.gulshan.khi@demo.haazir.pk       Tariq Cool Zone    (p027)
    plumber.gulshan.khi@demo.haazir.pk  Akbar Plumber      (p030)

--- ISLAMABAD ---
G-13:
    ac.islamabad@demo.haazir.pk         Muhammad Ali AC    (p001)

F-7:
    ac.f7.isb@demo.haazir.pk            Usman Tariq AC     (p002)
    electric.f6.isb@demo.haazir.pk      Asim Electrical    (p005)

G-9:
    plumber.g9.isb@demo.haazir.pk       Rashid Plumbing    (p004)
    plumber.isb@demo.haazir.pk          Bilal Plumbing     (p003)

--- LAHORE ---
Defence (DHA):
    tutor.lahore@demo.haazir.pk         Dr Ayesha Tutor    (p020)
    ac.dha.lhr@demo.haazir.pk           Adeel AC Master    (p011)
    electric.dha.lhr@demo.haazir.pk     Junaid Electricals (p017)

Gulberg:
    ac.gulberg.lhr@demo.haazir.pk       Shoaib Cool Air    (p012)
    plumber.gulberg.lhr@demo.haazir.pk  Saleem Pipes       (p015)

Model Town:
    ac.modeltown.lhr@demo.haazir.pk     Faisal AC          (p013)
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: pip install requests")
    sys.exit(1)

FIREBASE_API_KEY = "AIzaSyD2oRKslaA-6jqgfXfAFuNBYYwdpJHp-as"
FIREBASE_PROJECT_ID = "haazir-ai"
AUTH_SIGNUP = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
AUTH_SIGNIN = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
FS_BASE = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"

PW = "Haazir@123"

WORKERS = [
    # ─── KARACHI — Clifton ────────────────────────────────────────────────────
    {
        "email": "ac.karachi@demo.haazir.pk", "password": PW,
        "display_name": "Saad AC Technician",
        "skills": ["AC Repair", "AC installation", "gas refill"],
        "specializations": ["AC Repair", "AC installation"],
        "areas": ["Clifton", "Karachi"], "city": "Karachi", "area": "Clifton",
        "provider_id": "p028", "price_per_service": 950, "experience_years": 9, "rating": 4.8,
    },
    {
        "email": "electric.karachi@demo.haazir.pk", "password": PW,
        "display_name": "Rizwan Electricals",
        "skills": ["Electrician", "home wiring", "fault detection"],
        "specializations": ["Electrician", "Wiring"],
        "areas": ["Clifton", "Karachi"], "city": "Karachi", "area": "Clifton",
        "provider_id": "p031", "price_per_service": 850, "experience_years": 9, "rating": 4.7,
    },
    {
        "email": "beauty.clifton.khi@demo.haazir.pk", "password": PW,
        "display_name": "Zainab Home Salon",
        "skills": ["Beautician", "home salon", "mehndi", "makeup"],
        "specializations": ["Beautician", "Home Salon"],
        "areas": ["Clifton", "Karachi"], "city": "Karachi", "area": "Clifton",
        "provider_id": "p037", "price_per_service": 2500, "experience_years": 6, "rating": 4.9,
    },
    # ─── KARACHI — Defence / DHA ──────────────────────────────────────────────
    {
        "email": "ac.dha.khi@demo.haazir.pk", "password": PW,
        "display_name": "Hamza AC Services DHA",
        "skills": ["AC Repair", "AC installation", "gas refill"],
        "specializations": ["AC Repair", "AC installation"],
        "areas": ["DHA", "Defence", "Karachi"], "city": "Karachi", "area": "DHA",
        "provider_id": "p026", "price_per_service": 1100, "experience_years": 11, "rating": 4.8,
    },
    {
        "email": "plumber.dha.khi@demo.haazir.pk", "password": PW,
        "display_name": "Khalid Plumbing DHA",
        "skills": ["Plumber", "pipe repair", "drainage", "bathroom fitting"],
        "specializations": ["Plumber", "Bathroom Fitting"],
        "areas": ["DHA", "Defence", "Karachi"], "city": "Karachi", "area": "DHA",
        "provider_id": "p029", "price_per_service": 700, "experience_years": 8, "rating": 4.6,
    },
    # ─── KARACHI — Gulshan-e-Iqbal ────────────────────────────────────────────
    {
        "email": "ac.gulshan.khi@demo.haazir.pk", "password": PW,
        "display_name": "Tariq Cool Zone Gulshan",
        "skills": ["AC Repair", "AC installation", "AC servicing"],
        "specializations": ["AC Repair", "AC Servicing"],
        "areas": ["Gulshan-e-Iqbal", "Gulshan", "Karachi"], "city": "Karachi", "area": "Gulshan-e-Iqbal",
        "provider_id": "p027", "price_per_service": 900, "experience_years": 10, "rating": 4.7,
    },
    {
        "email": "plumber.gulshan.khi@demo.haazir.pk", "password": PW,
        "display_name": "Akbar Plumber Gulshan",
        "skills": ["Plumber", "pipe repair", "water tank", "drainage"],
        "specializations": ["Plumber", "Water Tank"],
        "areas": ["Gulshan-e-Iqbal", "Gulshan", "Karachi"], "city": "Karachi", "area": "Gulshan-e-Iqbal",
        "provider_id": "p030", "price_per_service": 650, "experience_years": 7, "rating": 4.5,
    },
    # ─── ISLAMABAD — G-13 ────────────────────────────────────────────────────
    {
        "email": "ac.islamabad@demo.haazir.pk", "password": PW,
        "display_name": "Muhammad Ali AC Services",
        "skills": ["AC Repair", "AC installation", "gas refill"],
        "specializations": ["AC Repair", "AC installation"],
        "areas": ["G-13", "Islamabad"], "city": "Islamabad", "area": "G-13",
        "provider_id": "p001", "price_per_service": 800, "experience_years": 7, "rating": 4.8,
    },
    # ─── ISLAMABAD — F-7 / F-6 ───────────────────────────────────────────────
    {
        "email": "ac.f7.isb@demo.haazir.pk", "password": PW,
        "display_name": "Usman Tariq Climate Control",
        "skills": ["AC Repair", "AC installation", "gas refill"],
        "specializations": ["AC Repair", "AC installation"],
        "areas": ["F-7", "Islamabad"], "city": "Islamabad", "area": "F-7",
        "provider_id": "p002", "price_per_service": 850, "experience_years": 8, "rating": 4.7,
    },
    {
        "email": "electric.f6.isb@demo.haazir.pk", "password": PW,
        "display_name": "Asim Electrical Solutions",
        "skills": ["Electrician", "home wiring", "fault detection", "DB installation"],
        "specializations": ["Electrician", "DB Installation"],
        "areas": ["F-6", "F-7", "Islamabad"], "city": "Islamabad", "area": "F-6",
        "provider_id": "p005", "price_per_service": 900, "experience_years": 10, "rating": 4.8,
    },
    # ─── ISLAMABAD — G-9 / I-8 ───────────────────────────────────────────────
    {
        "email": "plumber.g9.isb@demo.haazir.pk", "password": PW,
        "display_name": "Rashid Plumbing G-9",
        "skills": ["Plumber", "pipe repair", "drainage", "sanitary"],
        "specializations": ["Plumber", "Sanitary"],
        "areas": ["G-9", "Islamabad"], "city": "Islamabad", "area": "G-9",
        "provider_id": "p004", "price_per_service": 600, "experience_years": 9, "rating": 4.6,
    },
    {
        "email": "plumber.isb@demo.haazir.pk", "password": PW,
        "display_name": "Bilal Plumbing Works",
        "skills": ["Plumber", "pipe repair", "drainage"],
        "specializations": ["Plumber", "Pipe repair"],
        "areas": ["I-8", "Islamabad"], "city": "Islamabad", "area": "I-8",
        "provider_id": "p003", "price_per_service": 600, "experience_years": 9, "rating": 4.5,
    },
    # ─── LAHORE — Defence / DHA ──────────────────────────────────────────────
    {
        "email": "tutor.lahore@demo.haazir.pk", "password": PW,
        "display_name": "Dr Ayesha Math Physics",
        "skills": ["Tutor", "mathematics", "physics"],
        "specializations": ["Tutor", "Mathematics"],
        "areas": ["DHA", "Defence", "Lahore"], "city": "Lahore", "area": "DHA",
        "provider_id": "p020", "price_per_service": 2000, "experience_years": 8, "rating": 5.0,
    },
    {
        "email": "ac.dha.lhr@demo.haazir.pk", "password": PW,
        "display_name": "Adeel AC Master DHA Lahore",
        "skills": ["AC Repair", "AC installation", "gas refill"],
        "specializations": ["AC Repair", "AC installation"],
        "areas": ["DHA", "Defence", "Lahore"], "city": "Lahore", "area": "DHA",
        "provider_id": "p011", "price_per_service": 1000, "experience_years": 12, "rating": 4.9,
    },
    {
        "email": "electric.dha.lhr@demo.haazir.pk", "password": PW,
        "display_name": "Junaid Electricals DHA",
        "skills": ["Electrician", "home wiring", "fault detection"],
        "specializations": ["Electrician", "Wiring"],
        "areas": ["DHA", "Defence", "Lahore"], "city": "Lahore", "area": "DHA",
        "provider_id": "p017", "price_per_service": 950, "experience_years": 9, "rating": 4.7,
    },
    # ─── LAHORE — Gulberg ────────────────────────────────────────────────────
    {
        "email": "ac.gulberg.lhr@demo.haazir.pk", "password": PW,
        "display_name": "Shoaib Cool Air Gulberg",
        "skills": ["AC Repair", "AC installation", "AC servicing"],
        "specializations": ["AC Repair", "AC Servicing"],
        "areas": ["Gulberg", "Lahore"], "city": "Lahore", "area": "Gulberg",
        "provider_id": "p012", "price_per_service": 950, "experience_years": 10, "rating": 4.8,
    },
    {
        "email": "plumber.gulberg.lhr@demo.haazir.pk", "password": PW,
        "display_name": "Saleem Pipes Gulberg",
        "skills": ["Plumber", "pipe repair", "drainage", "water tank"],
        "specializations": ["Plumber", "Pipe repair"],
        "areas": ["Gulberg", "Lahore"], "city": "Lahore", "area": "Gulberg",
        "provider_id": "p015", "price_per_service": 650, "experience_years": 8, "rating": 4.6,
    },
    # ─── LAHORE — Model Town ─────────────────────────────────────────────────
    {
        "email": "ac.modeltown.lhr@demo.haazir.pk", "password": PW,
        "display_name": "Faisal AC Model Town",
        "skills": ["AC Repair", "AC installation", "gas refill", "refrigerator repair"],
        "specializations": ["AC Repair", "Refrigerator Repair"],
        "areas": ["Model Town", "Lahore"], "city": "Lahore", "area": "Model Town",
        "provider_id": "p013", "price_per_service": 900, "experience_years": 11, "rating": 4.8,
    },
]


# ─── Firestore value helpers ────────────────────────────────────────────────

def _fv(v: Any) -> dict:
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if v is None:
        return {"nullValue": None}
    if isinstance(v, list):
        return {"arrayValue": {"values": [_fv(i) for i in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: _fv(val) for k, val in v.items()}}}
    return {"stringValue": str(v)}


def _fs_doc(data: dict) -> dict:
    return {"fields": {k: _fv(v) for k, v in data.items()}}


# ─── Firebase Auth ───────────────────────────────────────────────────────────

def _get_token(email: str, password: str, display_name: str) -> tuple[str, str] | None:
    """Return (uid, idToken). Creates account if it doesn't exist."""
    r = requests.post(AUTH_SIGNUP, json={
        "email": email,
        "password": password,
        "displayName": display_name,
        "returnSecureToken": True,
    }, timeout=15)

    if r.status_code == 200:
        d = r.json()
        print(f"    [OK] Account created: {email}")
        return d["localId"], d["idToken"]

    err_msg = r.json().get("error", {}).get("message", "")
    if err_msg == "EMAIL_EXISTS":
        print(f"    [INFO] Already exists - signing in: {email}")
        r2 = requests.post(AUTH_SIGNIN, json={
            "email": email,
            "password": password,
            "returnSecureToken": True,
        }, timeout=15)
        if r2.status_code == 200:
            d = r2.json()
            return d["localId"], d["idToken"]
        print(f"    [FAIL] Sign-in failed: {r2.json().get('error', {}).get('message')}")
        return None

    print(f"    [FAIL] Auth error: {err_msg}")
    return None


# ─── Firestore write ─────────────────────────────────────────────────────────

def _write_user_doc(uid: str, token: str, data: dict) -> bool:
    url = f"{FS_BASE}/users/{uid}"
    r = requests.patch(
        url,
        headers={"Authorization": f"Bearer {token}"},
        json=_fs_doc(data),
        timeout=15,
    )
    return r.status_code in (200, 201)


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    print("\n[*] Haazir AI - Demo Worker Seeder")
    print("=" * 50)

    results = []
    for w in WORKERS:
        print(f"\n-> {w['display_name']}  ({w['email']})")
        token_data = _get_token(w["email"], w["password"], w["display_name"])
        if not token_data:
            results.append((w, None))
            continue

        uid, token = token_data
        slug = w["display_name"].lower().replace(" ", "_").replace(".", "")[:30]

        doc = {
            "user_id": uid,
            "uid": uid,
            "email": w["email"],
            "username": slug,
            "name": slug,
            "display_name": w["display_name"],
            "role": "worker",
            "skills": w["skills"],
            "areas": w["areas"],
            "city": w["city"],
            "area": w.get("area", w["city"]),
            "provider_id": w["provider_id"],
            "availability": True,
            "rating": w["rating"],
            "price_per_service": w["price_per_service"],
            "experience_years": w["experience_years"],
            "profile_complete": True,
            "worker_onboarded": True,
            "worker_data": {
                "specializations": w["specializations"],
                "areas": w["areas"],
                "area": w.get("area", w["city"]),
                "pricePerService": w["price_per_service"],
                "experienceYears": w["experience_years"],
                "availability": True,
                "rating": w["rating"],
                "providerId": w["provider_id"],
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        if _write_user_doc(uid, token, doc):
            print(f"    [OK] Firestore: users/{uid}  provider_id={w['provider_id']}")
            results.append((w, uid))
        else:
            print(f"    [FAIL] Firestore write failed for {uid}")
            results.append((w, None))

    # Summary
    print("\n" + "=" * 50)
    print("Worker Accounts Summary\n")
    print(f"  {'Email':<44} {'City':<12} {'Area':<22} Provider")
    print(f"  {'-'*44} {'-'*12} {'-'*22} --------")
    for w, uid in results:
        status = "[OK]  " if uid else "[FAIL]"
        area = w.get("area", w["city"])
        print(f"  {status} {w['email']:<42} {w['city']:<12} {area:<22} {w['provider_id']}")

    print("""
Use any of these accounts to log in as a Worker in the app.
The app will auto-link them to their provider profile so jobs show up.

NOTE: If workers still see no jobs, run seed_firebase.py to seed
the Firestore providers collection (requires firebase-key.json).
""")


if __name__ == "__main__":
    main()
