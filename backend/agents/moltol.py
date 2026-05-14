"""Agent 5 — MOLTOL: AI Negotiation + Order Pooling."""
import random
from datetime import datetime
from typing import List


NEGOTIATION_MESSAGES_URDU = [
    "Aapka rate thoda zyada hai — kya aap {target_price} mein kar saktay hain?",
    "Ek aur provider hai jo {target_price} mein ready hai — aap match karein?",
    "Customer regular hai, thoda discount milega toh kaam confirm ho sakta hai.",
]


class MoltolAgent:

    async def run_bidding(self, providers: List[dict], intent: dict, request_id: str) -> dict:
        start = datetime.now()

        top5 = providers[:5]
        service = intent.get("service_type", "service")
        urgency = intent.get("urgency", "medium")
        complexity = intent.get("job_complexity", "intermediate")

        bids = []
        for p in top5:
            base = p.get("price_per_hour", 800) * (2 if complexity == "complex" else 1)
            bid_price = int(base * random.uniform(0.90, 1.15))
            eta = int(p.get("distance_km", 3) * 4) + random.randint(5, 20)

            urdu_messages = [
                f"Kal subah pohonch jaunga, {service} ka kaam kar dunga.",
                f"Mera rate {bid_price} Rs hai, original quote se kam. Jaldi available hun.",
                f"Mujhe {complexity} kaam ka experience hai. {eta} minutes mein pohonchta hun.",
                f"Haazir hun! {bid_price} Rs mein acha kaam karunga, guarantee ke saath.",
            ]
            bid_message = random.choice(urdu_messages)

            bids.append({
                "provider_id": p["id"],
                "provider_name": p["name"],
                "bid_price": bid_price,
                "eta_minutes": eta,
                "message": bid_message,
                "rating": p.get("rating", 4.0),
                "negotiated": False,
                "final_price": bid_price,
            })

        negotiation_log = []
        for bid in bids:
            if bid["bid_price"] > 1500 and urgency != "critical":
                target_price = int(bid["bid_price"] * 0.90)
                msg = f"MOLTOL → {bid['provider_name']}: " + NEGOTIATION_MESSAGES_URDU[0].format(target_price=target_price)
                negotiation_log.append(msg)
                if random.random() > 0.4:
                    bid["final_price"] = target_price
                    bid["negotiated"] = True
                    negotiation_log.append(f"  ✅ {bid['provider_name']} agreed to Rs {target_price:,}")
                else:
                    negotiation_log.append(f"  ❌ {bid['provider_name']} declined to negotiate")

        def bid_score(b):
            price_norm = 1.0 - (b["final_price"] / max(x["final_price"] for x in bids))
            eta_norm = 1.0 - (b["eta_minutes"] / max(x["eta_minutes"] for x in bids))
            rating_norm = (b["rating"] - 1.0) / 4.0
            return price_norm * 0.40 + eta_norm * 0.30 + rating_norm * 0.30

        bids_sorted = sorted(bids, key=bid_score, reverse=True)
        top3 = bids_sorted[:3]
        recommended = top3[0]

        negotiation_log.append(
            f"✅ RECOMMENDATION: {recommended['provider_name']} "
            f"@ Rs {recommended['final_price']:,} | ETA {recommended['eta_minutes']} min | "
            f"Rating {recommended['rating']}"
        )

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        return {
            "request_id": request_id,
            "bids": top3,
            "recommended_bid": recommended,
            "negotiation_log": negotiation_log,
            "_log": {
                "agent_name": "MOLTOL",
                "agent_name_urdu": "مول تول",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": f"Broadcasting {service} request to {len(top5)} providers",
                "output_summary": f"Got {len(bids)} bids. Best: {recommended['provider_name']} @ Rs {recommended['final_price']:,}",
                "decision_made": f"Negotiated {sum(1 for b in bids if b['negotiated'])} provider(s). Recommended {recommended['provider_name']}.",
                "confidence": 0.92,
                "fallback_used": False,
                "time_seconds": elapsed,
            },
        }
