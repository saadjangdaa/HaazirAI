export type Role = "customer" | "worker";

export type CustomerScreen =
  | "home"
  | "results"
  | "pricing"
  | "confirm"
  | "tracking"
  | "feedback"
  | "dispute"
  | "fallback"
  | "bookings"
  | "profile";

export type WorkerScreen = "jobs" | "earnings" | "route" | "profile";

export type Provider = {
  id: string;
  name: string;
  rating: number;
  distanceKm: number;
  onTime: number;
  cancellation: number;
  price: number;
  recommended?: boolean;
  badge?: string;
  warning?: string;
  availability: string;
};
