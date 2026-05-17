import type { Provider } from "./types";

export const PROVIDERS: Provider[] = [
  {
    id: "ali",
    name: "Ali AC Tech",
    rating: 4.8,
    distanceKm: 1.8,
    onTime: 98,
    cancellation: 2,
    price: 1200,
    recommended: true,
    badge: "Complex Job ⚙️",
    availability: "Kal 10:00 AM",
  },
  {
    id: "tariq",
    name: "Tariq Cooling",
    rating: 4.5,
    distanceKm: 0.9,
    onTime: 78,
    cancellation: 18,
    price: 1100,
    warning: "Qareeb hai lekin cancellation rate zyada",
    availability: "Kal 11:00 AM",
  },
  {
    id: "city",
    name: "City Fix",
    rating: 4.1,
    distanceKm: 3,
    onTime: 88,
    cancellation: 9,
    price: 900,
    availability: "Kal 2:00 PM",
  },
];

export const SERVICE_CHIPS = [
  { icon: "🔧", label: "Plumber" },
  { icon: "⚡", label: "Electrician" },
  { icon: "❄️", label: "AC Tech" },
  { icon: "📚", label: "Tutor" },
  { icon: "🧹", label: "Cleaner" },
];

export const AGENT_STEPS = [
  {
    name: "SAMAJH",
    title: "Language Parser",
    detail: "Parsed: AC repair, G-13 Islamabad, kal subah, budget sensitive",
    confidence: 94,
  },
  {
    name: "DHUNDHO",
    title: "Provider Search",
    detail:
      "6 factors pe 3 providers rank kiye: distance, rating, AC specialization, on-time, cancellation, review recency",
  },
  {
    name: "CHUNNO",
    title: "Smart Selection",
    detail:
      "Provider Ali recommend: reliability 98%, AC specialist — Tariq qareeb tha lekin cancellation rate zyada",
  },
  {
    name: "PAKKA",
    title: "Booking Confirm",
    detail: "10:00 AM slot booked, confirmation sent, reminder scheduled",
  },
];
