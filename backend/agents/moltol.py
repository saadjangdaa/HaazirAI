"""Agent 5 — MOLTOL: AI Negotiation + Order Pooling + Bid Evaluation."""
import asyncio
import random
import uuid
from datetime import datetime

# Bid evaluation weights (must sum to 1.0)
WEIGHT_PRICE = 0.35
WEIGHT_ETA = 0.25
WEIGHT_RATING = 0.25
WEIGHT_PAST_PERF = 0.15

# Negotiation config
MAX_PROVIDERS_TO_BROADCAST = 5
TOP_BIDS_TO_PRESENT = 3
NEGOTIATION_THRESHOLD = 0.15  # negotiate if bid > 15% above median
MAX_NEGOTIATE_ROUNDS = 2
NEGOTIATION_DISCOUNT_RATE = 0.08  # ask for 8% reduction per round
BID_TIMEOUT_SECONDS = 8  # simulated timeout per provider

# Mock bid message templates (Roman Urdu / English mix — realistic Pakistan)
BID_MESSAGES_NORMAL = [
    "Kal subah {time} baje pohonch sakta hun. Kaam {duration} ghante mein ho jayega.",
    "Main available hun. {time} baje aaunga, sab tools saath hain.",
    "Haan ji, {time} baje available hun. Price mein negotiation ho sakti hai.",
    "Koi masla nahi, {time} baje pohonch jaunga. Material bhi saath launga.",
    "Available hun. Estimate {time} baje — kaam quality guaranteed.",
]
BID_MESSAGES_EMERGENCY = [
    "Emergency hai? Main 30 minute mein pohonch sakta hun.",
    "Abhi nikal sakta hun, 20-25 minute mein wahan hounga.",
    "Emergency case mein seedha aaunga. 35 min ETA.",
    "Haan ji foran aata hun. Sab equipment ready hai.",
]
BID_MESSAGES_COUNTER = [
    "Theek hai, Rs. {new_price} mein kar deta hun. Final offer.",
    "Acha, {new_price} par agree hun. Kab aana hai?",
    "Rs. {new_price} final — is se kam nahi ho sakta material cost ki wajah se.",
    "{new_price} par kaam kar leta hun, lekin travel allowance alag hoga.",
]


async def _simulate_provider_bid(
    provider: dict,
    intent: dict,
    reference_price: float,
    is_emergency: bool,
) -> dict | None:
    """
    Simulate a provider submitting a bid.
    In production: replace with actual WhatsApp/SMS API call + webhook listener.
    Returns None to simulate provider not responding (10% chance).
    """
    if random.random() < 0.10:
        return None

    await asyncio.sleep(random.uniform(0.1, 0.8))

    provider_id = provider.get("id", "unknown")
    provider_rating = float(provider.get("rating", 4.0))
    distance_km = float(provider.get("distance_km", 5.0))

    rating_premium = 1 + (provider_rating - 4.0) * 0.05
    price_variance = random.uniform(0.82, 1.20) * rating_premium
    bid_price = round(reference_price * price_variance / 100) * 100
    bid_price = max(bid_price, 500)

    base_eta = int(distance_km * 4)
    eta_minutes = max(15, base_eta + random.randint(-5, 20))
    if is_emergency:
        eta_minutes = max(15, int(eta_minutes * 0.6))

    if is_emergency:
        message = random.choice(BID_MESSAGES_EMERGENCY)
    else:
        message_template = random.choice(BID_MESSAGES_NORMAL)
        hour = random.choice(["9", "10", "11", "14", "15", "16"])
        duration = random.choice(["1", "1.5", "2", "2-3"])
        message = message_template.format(time=hour, duration=duration)

    return {
        "provider_id": provider_id,
        "provider_name": provider.get("name", "Provider"),
        "provider_rating": provider_rating,
        "provider_distance_km": distance_km,
        "provider_phone": provider.get("phone", ""),
        "bid_price": bid_price,
        "eta_minutes": eta_minutes,
        "message": message,
        "bid_time": datetime.now().isoformat(),
        "status": "submitted",
        "past_performance_score": min(1.0, (provider_rating - 3.0) / 2.0),
    }


def _score_bid(bid: dict, all_bids: list[dict]) -> float:
    """
    Score a single bid on 0-1 scale using weighted 4-factor model.
    Lower price = better. Lower ETA = better. Higher rating = better.
    Higher past performance = better.
    Returns composite score where higher = better.
    """
    prices = [b["bid_price"] for b in all_bids]
    etas = [b["eta_minutes"] for b in all_bids]

    min_price, max_price = min(prices), max(prices)
    min_eta, max_eta = min(etas), max(etas)

    price_score = (
        1.0 if max_price == min_price
        else (max_price - bid["bid_price"]) / (max_price - min_price)
    )
    eta_score = (
        1.0 if max_eta == min_eta
        else (max_eta - bid["eta_minutes"]) / (max_eta - min_eta)
    )
    rating_score = (bid["provider_rating"] - 1.0) / 4.0
    past_perf_score = bid.get("past_performance_score", 0.5)

    composite = (
        WEIGHT_PRICE * price_score
        + WEIGHT_ETA * eta_score
        + WEIGHT_RATING * rating_score
        + WEIGHT_PAST_PERF * past_perf_score
    )
    return round(composite, 4)


def _score_all_bids(bids: list[dict]) -> list[dict]:
    """Add composite_score and rank to each bid. Returns sorted list."""
    if not bids:
        return []
    if len(bids) == 1:
        return [{**bids[0], "composite_score": 1.0, "rank": 1}]
    scored = []
    for bid in bids:
        score = _score_bid(bid, bids)
        scored.append({**bid, "composite_score": score})
    scored.sort(key=lambda x: x["composite_score"], reverse=True)
    for i, b in enumerate(scored):
        b["rank"] = i + 1
    return scored


async def _negotiate_bid(
    bid: dict,
    median_price: float,
    round_num: int,
) -> dict:
    """
    Simulate negotiation with a provider who bid above threshold.
    Returns updated bid with negotiated price.
    """
    await asyncio.sleep(random.uniform(0.1, 0.4))

    target_price = round(bid["bid_price"] * (1 - NEGOTIATION_DISCOUNT_RATE) / 100) * 100
    target_price = max(target_price, median_price * 0.85)

    outcome = random.random()
    if outcome < 0.70:
        new_price = target_price
        accepted = True
        counter_message = random.choice(BID_MESSAGES_COUNTER).format(new_price=int(new_price))
    elif outcome < 0.90:
        new_price = round((bid["bid_price"] + target_price) / 2 / 100) * 100
        accepted = True
        counter_message = random.choice(BID_MESSAGES_COUNTER).format(new_price=int(new_price))
    else:
        new_price = bid["bid_price"]
        accepted = False
        counter_message = f"Rs. {int(new_price)} se kam mumkin nahi — final price hai."

    return {
        **bid,
        "bid_price": new_price,
        "original_bid_price": bid["bid_price"],
        "negotiated": True,
        "negotiation_accepted": accepted,
        "negotiation_rounds": round_num,
        "counter_message": counter_message,
        "savings": bid["bid_price"] - new_price,
    }


def _build_recommendation(top_bids: list[dict], intent: dict) -> str:
    """
    Generate a human-readable recommendation in Roman Urdu explaining
    why the top bid is recommended.
    """
    if not top_bids:
        return "Koi bid available nahi."

    best = top_bids[0]
    lang = intent.get("detected_language", "roman_urdu")
    is_emergency = intent.get("emergency", False)

    price_str = f"Rs. {int(best['bid_price']):,}"
    eta_str = f"{best['eta_minutes']} minute"
    rating_str = f"{best['provider_rating']}★"
    name = best.get("provider_name", "Provider")

    reasons = []

    if len(top_bids) > 1:
        others_avg = sum(b["bid_price"] for b in top_bids[1:]) / len(top_bids[1:])
        if best["bid_price"] < others_avg:
            saving = int(others_avg - best["bid_price"])
            reasons.append(f"sabse kam price ({price_str} — baqi se Rs. {saving:,} sasta)")
        else:
            reasons.append(f"competitive price ({price_str})")
    else:
        reasons.append(f"price {price_str}")

    if is_emergency:
        reasons.append(f"sabse jaldi ({eta_str} mein pohonchega)")
    else:
        reasons.append(f"ETA {eta_str}")

    if best["provider_rating"] >= 4.5:
        reasons.append(f"excellent rating ({rating_str})")
    elif best["provider_rating"] >= 4.0:
        reasons.append(f"achhi rating ({rating_str})")

    if best.get("negotiated") and best.get("savings", 0) > 0:
        reasons.append(f"negotiation se Rs. {int(best['savings']):,} bachaye")

    reasons_str = "، ".join(reasons)

    if lang == "urdu":
        return (
            f"ہماری سفارش: {name} — {reasons_str}۔ "
            f"اس provider کی past performance بھی اچھی ہے۔"
        )
    return (
        f"Hamari sifarish: {name} — {reasons_str}. "
        f"Is provider ki past performance bhi achi hai."
    )


def _no_bids_response(
    session_id: str,
    service: str,
    city: str,
    start: datetime,
    end: datetime,
    broadcast_log: list,
    reference_price: int = 0,
) -> dict:
    """Return structured response when no bids received."""
    elapsed = round((end - start).total_seconds(), 3)
    return {
        "session_id": session_id,
        "service": service,
        "city": city,
        "status": "no_bids",
        "top_bids": [],
        "all_bids_ranked": [],
        "recommendation": (
            "Kisi provider ne bid nahi di. "
            "Thodi der mein dobara try karein ya seedha booking karein."
        ),
        "recommended_provider_id": None,
        "broadcast_count": len(broadcast_log),
        "bids_received": 0,
        "no_response_providers": [b["provider_id"] for b in broadcast_log],
        "broadcast_log": broadcast_log,
        "negotiation_log": [],
        "total_negotiation_savings": 0,
        "median_bid_price": 0,
        "average_bid_price": 0,
        "reference_price": reference_price,
        "fallback_chain": [],
        "cancellation_note": "No bids received — fallback not available.",
        "_log": {
            "agent_name": "MOLTOL",
            "agent_name_urdu": "مول تول",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "input_summary": f"{service} in {city}",
            "output_summary": "0 bids received",
            "decision_made": "No bids — fallback response returned",
            "confidence": 0.0,
            "fallback_used": True,
            "time_seconds": elapsed,
        },
    }


class MoltolAgent:

    async def negotiate(self, intent: dict, providers: list[dict], pricing: dict) -> dict:
        """
        Full negotiation flow:
        1. Broadcast to top 5 providers simultaneously
        2. Collect bids (with timeout)
        3. Score all bids
        4. Negotiate with above-threshold bidders
        5. Re-score after negotiation
        6. Present top 3 with recommendation
        7. Handle cancellation fallback chain
        """
        start = datetime.now()
        session_id = f"NEG-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

        service = intent.get("service_type", "service")
        city = intent.get("city", "Islamabad")
        is_emergency = intent.get("emergency", False)
        reference_price = float(pricing.get("estimated_base", pricing.get("total", 2000)))

        broadcast_pool = providers[:MAX_PROVIDERS_TO_BROADCAST]
        broadcast_log = [
            {
                "provider_id": p.get("id"),
                "provider_name": p.get("name"),
                "broadcast_time": datetime.now().isoformat(),
                "channel": "whatsapp" if is_emergency else "app_notification",
            }
            for p in broadcast_pool
        ]

        bid_tasks = [
            _simulate_provider_bid(p, intent, reference_price, is_emergency)
            for p in broadcast_pool
        ]
        raw_results = await asyncio.gather(*bid_tasks, return_exceptions=True)

        raw_bids = []
        no_response = []
        for i, result in enumerate(raw_results):
            provider = broadcast_pool[i]
            if isinstance(result, Exception) or result is None:
                no_response.append(provider.get("id"))
            else:
                raw_bids.append(result)

        if not raw_bids:
            end = datetime.now()
            return _no_bids_response(
                session_id, service, city, start, end, broadcast_log, int(reference_price)
            )

        scored_bids = _score_all_bids(raw_bids)
        median_price = sorted(b["bid_price"] for b in scored_bids)[len(scored_bids) // 2]

        negotiation_log = []
        negotiated_bids = []

        for bid in scored_bids:
            overage = (bid["bid_price"] - median_price) / median_price if median_price else 0
            if overage > NEGOTIATION_THRESHOLD:
                current = bid
                for round_n in range(1, MAX_NEGOTIATE_ROUNDS + 1):
                    negotiated = await _negotiate_bid(current, median_price, round_n)
                    negotiation_log.append({
                        "provider_id": current["provider_id"],
                        "round": round_n,
                        "original_price": current["bid_price"],
                        "offered_price": negotiated["bid_price"],
                        "accepted": negotiated["negotiation_accepted"],
                        "savings": negotiated["savings"],
                    })
                    current = negotiated
                    if negotiated["negotiation_accepted"]:
                        break
                negotiated_bids.append(current)
            else:
                negotiated_bids.append({**bid, "negotiated": False})

        final_scored = _score_all_bids(negotiated_bids)

        top_3 = final_scored[:TOP_BIDS_TO_PRESENT]
        recommendation_text = _build_recommendation(top_3, intent)

        fallback_chain = [
            {
                "rank": b["rank"],
                "provider_id": b["provider_id"],
                "provider_name": b.get("provider_name"),
                "bid_price": b["bid_price"],
                "eta_minutes": b["eta_minutes"],
                "status": "standby",
                "activate_if": f"rank_{b['rank'] - 1}_cancels" if b["rank"] > 1 else "primary",
            }
            for b in final_scored
        ]

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        total_savings = sum(
            b.get("savings", 0) for b in negotiated_bids if b.get("negotiated")
        )
        avg_bid = sum(b["bid_price"] for b in raw_bids) / len(raw_bids)

        log_decision = (
            f"Broadcast to {len(broadcast_pool)}, received {len(raw_bids)} bids. "
            f"Negotiated {len(negotiation_log)} rounds. "
            f"Top bid: {top_3[0]['provider_name'] if top_3 else 'none'} @ "
            f"Rs.{top_3[0]['bid_price'] if top_3 else 0}. "
            f"Total savings from negotiation: Rs.{int(total_savings)}."
        )

        return {
            "session_id": session_id,
            "service": service,
            "city": city,
            "status": "bids_ready",
            "top_bids": top_3,
            "all_bids_ranked": final_scored,
            "recommendation": recommendation_text,
            "recommended_provider_id": top_3[0]["provider_id"] if top_3 else None,
            "broadcast_count": len(broadcast_pool),
            "bids_received": len(raw_bids),
            "no_response_providers": no_response,
            "broadcast_log": broadcast_log,
            "negotiation_log": negotiation_log,
            "total_negotiation_savings": int(total_savings),
            "median_bid_price": int(median_price),
            "average_bid_price": int(avg_bid),
            "reference_price": int(reference_price),
            "fallback_chain": fallback_chain,
            "cancellation_note": (
                f"Agar {top_3[0]['provider_name'] if top_3 else 'provider'} cancel kare, "
                f"fallback_chain[1] automatically activate hoga."
                if len(top_3) > 1
                else "No fallback available."
            ),
            "_log": {
                "agent_name": "MOLTOL",
                "agent_name_urdu": "مول تول",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": (
                    f"Negotiation: {service} in {city} | "
                    f"ref_price=Rs.{int(reference_price)} | "
                    f"emergency={is_emergency} | "
                    f"providers={len(broadcast_pool)}"
                ),
                "output_summary": (
                    f"Bids received: {len(raw_bids)}/{len(broadcast_pool)} | "
                    f"Top bid: Rs.{top_3[0]['bid_price'] if top_3 else 'N/A'} | "
                    f"Savings: Rs.{int(total_savings)}"
                ),
                "decision_made": log_decision,
                "confidence": min(1.0, len(raw_bids) / max(len(broadcast_pool), 1)),
                "fallback_used": False,
                "time_seconds": elapsed,
                "weights_used": {
                    "price": WEIGHT_PRICE,
                    "eta": WEIGHT_ETA,
                    "rating": WEIGHT_RATING,
                    "past_performance": WEIGHT_PAST_PERF,
                },
            },
        }

    async def handle_cancellation(
        self, session_result: dict, cancelled_provider_id: str
    ) -> dict:
        """
        Call this if the winning provider cancels after customer acceptance.
        Automatically activates next best bid from fallback_chain.
        Returns the new winning bid or failure message.
        """
        fallback_chain = session_result.get("fallback_chain", [])
        all_bids = session_result.get("all_bids_ranked", [])

        cancelled_rank = None
        for entry in fallback_chain:
            if entry["provider_id"] == cancelled_provider_id:
                cancelled_rank = entry["rank"]
                break

        if cancelled_rank is None:
            return {"status": "error", "message": "Cancelled provider not found in fallback chain."}

        next_bids = [b for b in all_bids if b["rank"] > cancelled_rank]
        if not next_bids:
            return {
                "status": "no_fallback",
                "message": (
                    "Koi aur provider available nahi. "
                    "Naya search karein ya waitlist join karein."
                ),
                "cancelled_provider_id": cancelled_provider_id,
            }

        new_winner = next_bids[0]
        return {
            "status": "fallback_activated",
            "new_winning_bid": new_winner,
            "new_provider_id": new_winner["provider_id"],
            "new_provider_name": new_winner.get("provider_name"),
            "new_bid_price": new_winner["bid_price"],
            "new_eta_minutes": new_winner["eta_minutes"],
            "message": (
                f"✅ {new_winner.get('provider_name')} ne booking accept kar li. "
                f"Naya estimate: Rs. {int(new_winner['bid_price']):,}, "
                f"ETA: {new_winner['eta_minutes']} minute."
            ),
            "cancelled_provider_id": cancelled_provider_id,
        }
