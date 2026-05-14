import { useEffect, useState } from "react";
import {
  Bell,
  Mic,
  Send,
  Filter,
  Star,
  MapPin,
  Clock,
  Phone,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Home,
  ClipboardList,
  Siren,
  User,
  Wallet,
  Map as MapIcon,
  Briefcase,
  X,
  Camera,
  Share2,
  CalendarPlus,
  Sparkles,
  PlayCircle,
  TrendingUp,
} from "lucide-react";
import type {
  Role,
  CustomerScreen,
  WorkerScreen,
} from "./types";
import { PROVIDERS, SERVICE_CHIPS, AGENT_STEPS } from "./data";

/* ───────────────── shared bits ───────────────── */

function RoleSwitcher({
  role,
  setRole,
}: {
  role: Role;
  setRole: (r: Role) => void;
}) {
  const accent = role === "customer" ? "bg-emerald" : "bg-amber";
  return (
    <div className="px-4 pt-3 pb-2">
      <div className="relative grid grid-cols-2 rounded-full bg-navy-elev p-1 border border-white/5">
        <span
          className={`absolute top-1 bottom-1 w-1/2 rounded-full transition-all duration-300 ${accent} ${
            role === "worker" ? "translate-x-full" : "translate-x-0"
          }`}
          style={{ opacity: 0.95 }}
        />
        <button
          onClick={() => setRole("customer")}
          className={`relative z-10 py-2 text-sm font-semibold transition-colors ${
            role === "customer" ? "text-navy" : "text-muted-foreground"
          }`}
        >
          👤 Customer
        </button>
        <button
          onClick={() => setRole("worker")}
          className={`relative z-10 py-2 text-sm font-semibold transition-colors ${
            role === "worker" ? "text-navy" : "text-muted-foreground"
          }`}
        >
          🔧 Worker
        </button>
      </div>
    </div>
  );
}

function ScreenScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="scroll-area flex-1 overflow-y-auto px-4 pb-28 pt-2 space-y-4">
      {children}
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-card border border-white/5 p-4 ${className}`}
    >
      {children}
    </div>
  );
}

function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "emerald" | "amber" | "danger";
}) {
  const map = {
    default: "bg-white/5 text-muted-foreground",
    emerald: "bg-emerald-soft text-emerald",
    amber: "bg-amber-soft text-amber",
    danger: "bg-danger-soft text-danger",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function PrimaryBtn({
  children,
  onClick,
  tone = "emerald",
  full = true,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "emerald" | "amber" | "danger" | "ghost";
  full?: boolean;
}) {
  const map = {
    emerald: "bg-emerald text-navy hover:brightness-110",
    amber: "bg-amber text-navy hover:brightness-110",
    danger: "bg-danger text-white hover:brightness-110",
    ghost: "bg-white/5 text-foreground hover:bg-white/10",
  } as const;
  return (
    <button
      onClick={onClick}
      className={`${full ? "w-full" : ""} rounded-xl ${map[tone]} px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98]`}
    >
      {children}
    </button>
  );
}

/* ───────────────── customer screens ───────────────── */

function CustomerHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-1 py-2">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-emerald-soft grid place-items-center text-lg">
          🤖
        </div>
        <div>
          <div className="text-base font-bold leading-none">{title}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Pakistan's AI service agent
          </div>
        </div>
      </div>
      <button className="relative h-9 w-9 rounded-xl bg-white/5 grid place-items-center">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald" />
      </button>
    </div>
  );
}

function AgentTraceDrawer({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    if (step < AGENT_STEPS.length) {
      const t = setTimeout(() => setStep((s) => s + 1), 800);
      return () => clearTimeout(t);
    }
  }, [open, step]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-popover border-t border-white/10 p-5 animate-slide-up max-h-[80%] overflow-y-auto scroll-area">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald" />
            <h3 className="font-bold">Agent Trace</h3>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          4 agents working together
        </p>
        <div className="space-y-3">
          {AGENT_STEPS.map((s, i) => {
            const active = i < step;
            return (
              <div
                key={s.name}
                className={`rounded-xl border p-3 transition-all ${
                  active
                    ? "border-emerald/40 bg-emerald-soft animate-step-in"
                    : "border-white/5 bg-white/[0.02] opacity-40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-7 w-7 rounded-full grid place-items-center text-xs font-bold ${
                      active ? "bg-emerald text-navy" : "bg-white/10"
                    }`}
                  >
                    {active ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {s.title}
                      </span>
                    </div>
                  </div>
                  {s.confidence && active && (
                    <Pill tone="emerald">Confidence {s.confidence}% ✅</Pill>
                  )}
                </div>
                {active && (
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    {s.detail}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {step >= AGENT_STEPS.length && (
          <div className="mt-4">
            <PrimaryBtn onClick={onComplete}>Providers Dekhein →</PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function HomeScreen({
  go,
  openTrace,
}: {
  go: (s: CustomerScreen) => void;
  openTrace: () => void;
}) {
  return (
    <ScreenScroll>
      <CustomerHeader title="Haazir 🤖" />

      <div className="space-y-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Assalam o Alaikum! 👋
        </h1>
        <p className="text-muted-foreground text-sm">Kya chahiye aaj?</p>
      </div>

      <div className="flex flex-col items-center py-6">
        <button className="relative h-24 w-24 rounded-full bg-emerald grid place-items-center animate-pulse-glow">
          <Mic className="h-9 w-9 text-navy" />
        </button>
        <p className="mt-3 text-sm font-medium">Bolein ya likhein</p>
      </div>

      <div className="flex items-center gap-2 rounded-2xl bg-card border border-white/5 px-3 py-2">
        <input
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 outline-none py-2"
          placeholder="e.g. AC bilkul kaam nahi kar raha, kal subah chahiye..."
        />
        <button className="h-9 w-9 rounded-xl bg-emerald grid place-items-center">
          <Send className="h-4 w-4 text-navy" />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto scroll-area -mx-4 px-4 pb-1">
        {SERVICE_CHIPS.map((c) => (
          <button
            key={c.label}
            className="shrink-0 rounded-full bg-white/5 border border-white/5 px-3 py-2 text-xs font-medium hover:bg-white/10"
          >
            <span className="mr-1">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PrimaryBtn onClick={openTrace}>
          <span className="inline-flex items-center gap-1.5">
            <PlayCircle className="h-4 w-4" /> Try Demo
          </span>
        </PrimaryBtn>
        <PrimaryBtn tone="ghost" onClick={() => go("fallback")}>
          No Provider Demo
        </PrimaryBtn>
      </div>

      <Card className="bg-gradient-to-br from-emerald-soft to-transparent border-emerald/20">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-emerald" />
          <span className="text-sm font-semibold">Haazir hai!</span>
        </div>
        <p className="text-xs text-muted-foreground">
          4 AI agents — SAMAJH, DHUNDHO, CHUNNO, PAKKA — milkar aapka best
          provider chunte hain. Fikr mat karo. ✨
        </p>
      </Card>
    </ScreenScroll>
  );
}

function ResultsScreen({ go }: { go: (s: CustomerScreen) => void }) {
  const [urgent, setUrgent] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  return (
    <ScreenScroll>
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-xl font-bold">3 Providers Mile</h2>
          <p className="text-xs text-muted-foreground">AC Repair · G-13</p>
        </div>
        <button className="h-10 w-10 rounded-xl bg-white/5 grid place-items-center">
          <Filter className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          "📍 Distance",
          "⭐ Rating",
          "🕐 On-Time",
          "❄️ Specialization",
          "💰 Price",
          "📊 Reviews",
        ].map((t) => (
          <Pill key={t}>{t}</Pill>
        ))}
      </div>

      {PROVIDERS.map((p) => (
        <Card
          key={p.id}
          className={
            p.recommended
              ? "border-emerald/40 bg-gradient-to-br from-emerald-soft/40 to-transparent"
              : ""
          }
        >
          {p.recommended && (
            <div className="mb-2">
              <Pill tone="emerald">✨ AI Recommended</Pill>
            </div>
          )}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold">{p.name}</h3>
                {p.badge && <Pill tone="amber">{p.badge}</Pill>}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber text-amber" />
                  {p.rating}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {p.distanceKm}km
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {p.onTime}%
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Cancel: {p.cancellation}% · {p.availability} ✅
              </div>
              {p.warning && (
                <div className="mt-2">
                  <Pill tone="amber">
                    <AlertTriangle className="h-3 w-3" /> {p.warning}
                  </Pill>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-emerald">
                Rs.{p.price}
              </div>
              <div className="text-[10px] text-muted-foreground">est.</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PrimaryBtn tone="ghost" onClick={() => go("pricing")}>
              View Pricing
            </PrimaryBtn>
            <PrimaryBtn onClick={() => go("pricing")}>Book Now</PrimaryBtn>
          </div>
        </Card>
      ))}

      <Card>
        <button
          onClick={() => setReasonOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <span className="text-sm font-semibold inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald" /> Why Ali?
          </span>
          <ChevronRight
            className={`h-4 w-4 transition-transform ${
              reasonOpen ? "rotate-90" : ""
            }`}
          />
        </button>
        {reasonOpen && (
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            Ali ko isliye choose kiya: AC repair mein specialist hai, on-time
            score 98%, recent reviews positive. Tariq qareeb tha lekin
            cancellation rate 18% — risk zyada tha. ✅
          </p>
        )}
      </Card>

      <Card className="border-amber/30 bg-amber-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Urgent chahiye?</div>
            <div className="text-[11px] text-muted-foreground">
              +Rs.200 — 2 ghante mein available
            </div>
          </div>
          <button
            onClick={() => setUrgent((u) => !u)}
            className={`h-7 w-12 rounded-full transition-colors ${
              urgent ? "bg-amber" : "bg-white/10"
            } relative`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-navy transition-all ${
                urgent ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </Card>
    </ScreenScroll>
  );
}

function PricingScreen({ go }: { go: (s: CustomerScreen) => void }) {
  const rows = [
    ["Visit Fee", "Rs. 500"],
    ["Distance Cost (1.8km)", "Rs. 150"],
    ["Job Complexity (AC compressor)", "Rs. 300"],
    ["Urgency Adjustment", "Rs. 0"],
    ["Loyalty Discount", "-Rs. 50"],
  ];
  return (
    <ScreenScroll>
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-xl font-bold">Price Estimate</h2>
        <Pill tone="emerald">Fair Price ✅</Pill>
      </div>

      <Card>
        <div className="space-y-2.5">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
          <div className="border-t border-white/10 pt-3 flex items-center justify-between">
            <span className="font-semibold">Total Estimate</span>
            <span className="text-2xl font-extrabold text-emerald">
              Rs. 900
            </span>
          </div>
        </div>
      </Card>

      <Card className="border-emerald/20">
        <div className="flex items-center justify-between">
          <span className="text-sm">Demand</span>
          <Pill tone="emerald">🟢 Normal — no surge</Pill>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Peak hours</span>
          <Pill tone="amber">🟡 High Demand +15%</Pill>
        </div>
      </Card>

      <Card className="border-amber/30 bg-amber-soft">
        <div className="text-sm font-semibold">💡 Budget option</div>
        <p className="text-xs text-muted-foreground mt-1">
          City Fix — Rs.700, available kal 2pm
        </p>
      </Card>

      <PrimaryBtn onClick={() => go("confirm")}>Confirm & Book</PrimaryBtn>
    </ScreenScroll>
  );
}

function ConfirmScreen({ go }: { go: (s: CustomerScreen) => void }) {
  return (
    <ScreenScroll>
      <div className="pt-2 text-center space-y-2">
        <div className="mx-auto h-16 w-16 rounded-full bg-emerald-soft grid place-items-center">
          <CheckCircle2 className="h-8 w-8 text-emerald" />
        </div>
        <h2 className="text-xl font-extrabold">Booking ho gayi! 🎉</h2>
        <p className="text-xs text-muted-foreground">
          Confirmation WhatsApp pe bhej diya
        </p>
      </div>

      <Card>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service</span>
            <span className="font-medium">AC Repair (Complex)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Provider</span>
            <span className="font-medium">Ali AC Tech</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">15 May, 10:00 AM</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Location</span>
            <span className="font-medium">G-13, Islamabad</span>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-2">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-emerald">Rs. 900</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Booking ID</span>
            <span className="font-mono text-xs">#HAZ-2024-0042</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <PrimaryBtn tone="ghost">
          <span className="inline-flex items-center gap-1.5">
            <CalendarPlus className="h-4 w-4" /> Calendar
          </span>
        </PrimaryBtn>
        <PrimaryBtn tone="ghost">
          <span className="inline-flex items-center gap-1.5">
            <Share2 className="h-4 w-4" /> WhatsApp
          </span>
        </PrimaryBtn>
      </div>

      <Card className="border-emerald/20">
        <div className="text-sm font-semibold">
          🔔 6 mahine baad AC service reminder?
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <PrimaryBtn>Yes</PrimaryBtn>
          <PrimaryBtn tone="ghost">No</PrimaryBtn>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm">Cash on Service</span>
          <Pill tone="amber">Rs.900 pending</Pill>
        </div>
      </Card>

      <PrimaryBtn onClick={() => go("tracking")}>Track Live →</PrimaryBtn>
    </ScreenScroll>
  );
}

function TrackingScreen({ go }: { go: (s: CustomerScreen) => void }) {
  const [cancelFlow, setCancelFlow] = useState<"idle" | "alert" | "rebook">(
    "idle",
  );
  return (
    <ScreenScroll>
      <h2 className="text-xl font-bold pt-2">Live Tracking</h2>

      <div className="relative h-48 rounded-2xl overflow-hidden border border-white/5 bg-gradient-to-br from-navy-elev via-navy-soft to-emerald-soft">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(0deg, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="absolute top-6 left-8 h-3 w-3 rounded-full bg-emerald ring-4 ring-emerald/30 animate-pulse" />
        <div className="absolute bottom-8 right-10 h-3 w-3 rounded-full bg-amber ring-4 ring-amber/30" />
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d="M 12 14 Q 50 50 88 78"
            stroke="rgb(0 200 150)"
            strokeWidth="0.6"
            strokeDasharray="2 2"
            fill="none"
          />
        </svg>
        <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-navy/80 backdrop-blur p-2.5 text-xs">
          <span className="font-semibold text-emerald">Ali raaste mein hai</span>{" "}
          — 12 min mein pohanchega
        </div>
      </div>

      <Card>
        <div className="space-y-3">
          {[
            ["✅", "Booking Confirmed", "9:30 AM", false],
            ["✅", "Provider Assigned", "9:32 AM", false],
            ["🔄", "En Route", "ETA 10:12 AM", true],
            ["⏳", "Service In Progress", "—", false],
            ["⏳", "Completed", "—", false],
          ].map(([ic, label, time, active]) => (
            <div key={label as string} className="flex items-center gap-3">
              <div
                className={`h-7 w-7 rounded-full grid place-items-center text-sm ${
                  active ? "bg-emerald-soft animate-pulse" : "bg-white/5"
                }`}
              >
                {ic as string}
              </div>
              <div className="flex-1">
                <div
                  className={`text-sm ${
                    active ? "font-semibold text-emerald" : ""
                  }`}
                >
                  {label as string}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {time as string}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-soft grid place-items-center font-bold text-emerald">
            A
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Ali AC Tech</div>
            <div className="text-[11px] text-muted-foreground">⭐ 4.8 · AC Specialist</div>
          </div>
          <button className="h-10 w-10 rounded-xl bg-emerald grid place-items-center">
            <Phone className="h-4 w-4 text-navy" />
          </button>
          <button className="h-10 px-3 rounded-xl bg-white/5 text-xs font-semibold">
            Chat
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <PrimaryBtn tone="danger">
          <span className="inline-flex items-center gap-1.5">
            <Siren className="h-4 w-4" /> Emergency
          </span>
        </PrimaryBtn>
        <PrimaryBtn tone="amber" onClick={() => setCancelFlow("alert")}>
          Simulate Cancel
        </PrimaryBtn>
      </div>

      {cancelFlow === "alert" && (
        <Card className="border-danger/40 bg-danger-soft">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <span className="text-sm font-semibold">
              Ali ne cancel kar diya!
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Agent naya provider dhundh raha hai... ⏳
          </p>
          <div className="mt-3">
            <PrimaryBtn onClick={() => setCancelFlow("rebook")}>
              Naya Provider Dekhein
            </PrimaryBtn>
          </div>
        </Card>
      )}
      {cancelFlow === "rebook" && (
        <Card className="border-emerald/40">
          <div className="text-sm font-semibold">
            Tariq Cooling available hai
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            11:00 AM slot. Auto-rebook karein?
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PrimaryBtn onClick={() => setCancelFlow("idle")}>Yes</PrimaryBtn>
            <PrimaryBtn tone="ghost" onClick={() => setCancelFlow("idle")}>
              No
            </PrimaryBtn>
          </div>
        </Card>
      )}

      <PrimaryBtn tone="ghost" onClick={() => go("feedback")}>
        Mark Complete (Demo) →
      </PrimaryBtn>
    </ScreenScroll>
  );
}

function FeedbackScreen() {
  const [stars, setStars] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const tags = [
    "✅ Punctual",
    "✅ Professional",
    "✅ Fair Price",
    "❌ Noisy Work",
  ];
  const [active, setActive] = useState<string[]>([]);

  return (
    <ScreenScroll>
      <div className="pt-2">
        <h2 className="text-xl font-extrabold">Kaam ho gaya! ✅</h2>
        <p className="text-xs text-muted-foreground">Ali ne service complete ki</p>
      </div>

      <Card>
        <div className="text-sm font-semibold mb-2">Completion Checklist</div>
        <div className="space-y-1.5 text-sm">
          {["AC filter cleaned", "Gas pressure checked", "Cooling test done"].map(
            (i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald" />
                <span>{i}</span>
              </div>
            ),
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <div className="h-16 w-16 rounded-lg bg-white/5 grid place-items-center">
            <Camera className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="h-16 w-16 rounded-lg bg-white/5 grid place-items-center">
            <Camera className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-[11px] text-muted-foreground self-center">
            Ali ne 2 photos upload kiye
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold">Ali ko rate karein</div>
        <div className="mt-2 flex gap-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => setStars(s)}>
              <Star
                className={`h-8 w-8 transition-all ${
                  s <= stars
                    ? "fill-amber text-amber scale-110"
                    : "text-white/20"
                }`}
              />
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 w-full rounded-xl bg-white/5 border border-white/5 p-3 text-sm placeholder:text-muted-foreground/60 outline-none"
          rows={2}
          placeholder="Kya issue tha? Kya theek hua?"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = active.includes(t);
            return (
              <button
                key={t}
                onClick={() =>
                  setActive((a) =>
                    on ? a.filter((x) => x !== t) : [...a, t],
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  on
                    ? "bg-emerald-soft border-emerald/40 text-emerald"
                    : "bg-white/5 border-white/5 text-muted-foreground"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Card>

      {submitted ? (
        <Card className="border-emerald/40 bg-emerald-soft animate-fade-up">
          <div className="text-sm font-semibold">Shukriya! 🎉</div>
          <p className="text-xs text-muted-foreground mt-1">
            Ali ki rating update ho gayi ⭐ 4.9
          </p>
        </Card>
      ) : (
        <PrimaryBtn onClick={() => setSubmitted(true)}>
          Submit Feedback
        </PrimaryBtn>
      )}
    </ScreenScroll>
  );
}

function DisputeScreen() {
  const types = [
    { id: "noshow", label: "Provider No-Show", icon: "😤" },
    { id: "price", label: "Price Disagreement", icon: "💰" },
    { id: "quality", label: "Quality Complaint", icon: "😞" },
    { id: "incomplete", label: "Job Not Completed", icon: "⏰" },
  ];
  const [sel, setSel] = useState("quality");
  return (
    <ScreenScroll>
      <h2 className="text-xl font-extrabold pt-2 text-danger">
        Masla Darj Karein 🚨
      </h2>

      <div className="grid grid-cols-2 gap-2">
        {types.map((t) => {
          const on = sel === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSel(t.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                on
                  ? "border-danger bg-danger-soft"
                  : "border-white/5 bg-card"
              }`}
            >
              <div className="text-lg">{t.icon}</div>
              <div className="text-xs font-semibold mt-1">{t.label}</div>
            </button>
          );
        })}
      </div>

      <Card>
        <textarea
          className="w-full rounded-xl bg-white/5 border border-white/5 p-3 text-sm placeholder:text-muted-foreground/60 outline-none"
          rows={3}
          placeholder="Kya hua? Batayein..."
        />
        <button className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs font-medium">
          <Camera className="h-3.5 w-3.5" /> + Add Evidence
        </button>
      </Card>

      <Card className="border-danger/30 bg-gradient-to-br from-danger-soft to-transparent">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-danger animate-pulse" />
          <span className="text-sm font-semibold">Dispute Agent active hai</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Ali ki history check ho rahi hai...
        </p>
        <div className="mt-2 rounded-lg bg-white/5 p-2 text-[11px]">
          📊 Ali ki last 30 din mein 2 complaints — escalation warranted
        </div>
      </Card>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Resolution Options
        </div>
        {[
          ["🔄 Re-do Service (free)", "emerald"],
          ["💸 Partial Refund: Rs.300", "amber"],
          ["📞 Human Agent se baat karein", "ghost"],
        ].map(([l, t]) => (
          <PrimaryBtn key={l as string} tone={t as never}>
            {l as string}
          </PrimaryBtn>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between text-xs">
          <span>Status: Dispute #D-0021</span>
          <Pill tone="amber">Under Review</Pill>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          24hr mein jawab milega
        </p>
        <p className="text-[11px] text-danger mt-2">
          ⚠️ Provider flagged for review
        </p>
      </Card>
    </ScreenScroll>
  );
}

function FallbackScreen({ go }: { go: (s: CustomerScreen) => void }) {
  return (
    <ScreenScroll>
      <div className="pt-2 text-center">
        <div className="text-5xl">😔</div>
        <h2 className="text-xl font-extrabold mt-2">Afsos!</h2>
        <p className="text-xs text-muted-foreground mt-1">
          G-13 mein kal subah koi AC technician available nahi
        </p>
      </div>

      <div className="space-y-2">
        {[
          "💡 Kal dopahar available hain 2 providers — slot change karein?",
          "💡 Aas-paas G-10 mein Ali available hai — thoda door (4km)",
          "💡 Waitlist mein add ho jayein — cancel hone pe automatically book",
        ].map((s) => (
          <Card key={s}>
            <p className="text-xs">{s}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <PrimaryBtn tone="ghost">Change Time</PrimaryBtn>
        <PrimaryBtn tone="ghost">Nearby Area</PrimaryBtn>
        <PrimaryBtn>Waitlist</PrimaryBtn>
      </div>

      <Card className="border-amber/30 bg-amber-soft">
        <div className="text-sm font-semibold">📋 Waitlist Status</div>
        <p className="text-xs text-muted-foreground mt-1">
          3 log pehle se waitlist mein hain — aap <b>#4</b> honge
        </p>
      </Card>

      <PrimaryBtn tone="ghost" onClick={() => go("home")}>
        ← Wapas Home
      </PrimaryBtn>
    </ScreenScroll>
  );
}

function BookingsScreen({ go }: { go: (s: CustomerScreen) => void }) {
  const items = [
    {
      svc: "AC Repair",
      who: "Ali AC Tech",
      when: "15 May, 10:00 AM",
      status: "En Route",
      tone: "emerald" as const,
    },
    {
      svc: "Plumber",
      who: "Ustad Rasheed",
      when: "12 May, 3:00 PM",
      status: "Completed",
      tone: "default" as const,
    },
    {
      svc: "Electrician",
      who: "City Fix",
      when: "5 May, 11:00 AM",
      status: "Completed",
      tone: "default" as const,
    },
  ];
  return (
    <ScreenScroll>
      <h2 className="text-xl font-bold pt-2">My Bookings</h2>
      {items.map((b, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">{b.svc}</div>
              <div className="text-[11px] text-muted-foreground">
                {b.who} · {b.when}
              </div>
            </div>
            <Pill tone={b.tone}>{b.status}</Pill>
          </div>
          {i === 0 && (
            <div className="mt-3">
              <PrimaryBtn onClick={() => go("tracking")}>Track Live</PrimaryBtn>
            </div>
          )}
        </Card>
      ))}
    </ScreenScroll>
  );
}

function CustomerProfile() {
  return (
    <ScreenScroll>
      <h2 className="text-xl font-bold pt-2">Profile</h2>
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-emerald-soft grid place-items-center text-xl font-bold text-emerald">
            A
          </div>
          <div>
            <div className="font-bold">Ahmed Khan</div>
            <div className="text-[11px] text-muted-foreground">
              G-13, Islamabad · Member since 2024
            </div>
            <Pill tone="emerald">Loyal Customer ⭐</Pill>
          </div>
        </div>
      </Card>
      <Card>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-emerald">12</div>
            <div className="text-[10px] text-muted-foreground">Bookings</div>
          </div>
          <div>
            <div className="text-lg font-bold">Rs.14k</div>
            <div className="text-[10px] text-muted-foreground">Spent</div>
          </div>
          <div>
            <div className="text-lg font-bold">Rs.350</div>
            <div className="text-[10px] text-muted-foreground">Saved</div>
          </div>
        </div>
      </Card>
      <Card>
        {[
          "Saved Addresses",
          "Payment Methods",
          "Notifications",
          "Help & Support",
          "Logout",
        ].map((r) => (
          <div
            key={r}
            className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0 text-sm"
          >
            {r} <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
      </Card>
    </ScreenScroll>
  );
}

/* ───────────────── worker screens ───────────────── */

function WorkerHeader() {
  const [online, setOnline] = useState(true);
  return (
    <div className="flex items-center justify-between px-1 py-2">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-amber-soft grid place-items-center text-lg">
          🔧
        </div>
        <div>
          <div className="text-base font-bold leading-none">Haazir Worker</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Ali AC Tech
          </div>
        </div>
      </div>
      <button
        onClick={() => setOnline((o) => !o)}
        className={`px-3 h-9 rounded-full text-xs font-semibold ${
          online ? "bg-emerald text-navy" : "bg-white/10 text-muted-foreground"
        }`}
      >
        {online ? "Online ✅" : "Offline"}
      </button>
    </div>
  );
}

function WorkerJobs() {
  const [accepted, setAccepted] = useState(false);
  const [secs, setSecs] = useState(59);
  useEffect(() => {
    if (accepted) return;
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [accepted]);

  return (
    <ScreenScroll>
      <WorkerHeader />
      <div className="pt-2">
        <h2 className="text-xl font-bold">Aap Online Hain ✅</h2>
        <p className="text-xs text-muted-foreground">
          Naye kaam aa rahe hain
        </p>
      </div>

      {!accepted && (
        <Card className="border-amber/50 bg-amber-soft animate-pulse-glow">
          <div className="flex items-center justify-between">
            <Pill tone="amber">🔔 Naya Kaam!</Pill>
            <span className="text-[11px] font-mono text-amber">
              {secs}s expire
            </span>
          </div>
          <div className="mt-2">
            <div className="font-bold">AC Repair (Complex ⚙️)</div>
            <div className="text-[11px] text-muted-foreground">
              Ahmed · G-13 · 1.8km
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Offered</span>
            <span className="font-bold text-emerald">Rs.900</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Time: Kal 10:00 AM
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PrimaryBtn onClick={() => setAccepted(true)}>✅ Accept</PrimaryBtn>
            <PrimaryBtn tone="ghost">❌ Decline</PrimaryBtn>
          </div>
        </Card>
      )}

      <Card className="border-amber/30 bg-amber-soft">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber shrink-0 mt-0.5" />
          <p className="text-xs">
            Ye slot aapke doosre kaam se overlap kar raha hai — 11 AM lein?
          </p>
        </div>
      </Card>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Active Jobs
        </div>
        {[
          { svc: "AC Service", who: "Fatima · G-10", t: "12:30 PM", s: "En Route" },
          { svc: "Electrician", who: "Bilal · F-7", t: "3:00 PM", s: "Pending" },
        ].map((j, i) => (
          <Card key={i} className="mb-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">{j.svc}</div>
                <div className="text-[11px] text-muted-foreground">
                  {j.who} · {j.t}
                </div>
              </div>
              <Pill tone={j.s === "En Route" ? "emerald" : "default"}>
                {j.s}
              </Pill>
            </div>
          </Card>
        ))}
      </div>
    </ScreenScroll>
  );
}

function WorkerEarnings() {
  const bars = [40, 65, 50, 80, 95, 70, 88];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <ScreenScroll>
      <h2 className="text-xl font-bold pt-2">Meri Kamai 💰</h2>

      <div className="grid grid-cols-2 gap-2">
        <Card>
          <div className="text-[11px] text-muted-foreground">Aaj</div>
          <div className="text-2xl font-extrabold text-amber">Rs.3,200</div>
          <div className="text-[11px] text-muted-foreground">4 kaam</div>
        </Card>
        <Card>
          <div className="text-[11px] text-muted-foreground">Rating</div>
          <div className="text-2xl font-extrabold">⭐ 4.9</div>
          <div className="text-[11px] text-muted-foreground">On-Time 96%</div>
        </Card>
      </div>

      <Card className="border-amber/30 bg-amber-soft">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber" />
          <span className="text-sm font-semibold">AI Voice Report</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          "Aaj 4 kaam, Rs.3,200 — kal 3 bookings pending. Wah ustad! 🎉"
        </p>
        <div className="mt-3">
          <PrimaryBtn tone="amber">▶ Sunein</PrimaryBtn>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3">This Week</div>
        <div className="flex items-end justify-between gap-2 h-32">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-emerald to-emerald/50"
                style={{ height: `${h}%` }}
              />
              <div className="text-[10px] text-muted-foreground">
                {days[i]}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-emerald/20">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald" />
          <span className="text-sm font-semibold">Demand Forecast</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Kal AC requests zyada hongi — online rahein! 📈
        </p>
      </Card>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Pending Payments
        </div>
        <Card className="mb-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Ahmed</div>
              <div className="text-[11px] text-muted-foreground">Rs.900</div>
            </div>
            <PrimaryBtn tone="ghost" full={false}>
              Remind
            </PrimaryBtn>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Sara</div>
              <div className="text-[11px] text-muted-foreground">Rs.1,200</div>
            </div>
            <Pill tone="emerald">Received ✅</Pill>
          </div>
        </Card>
      </div>
    </ScreenScroll>
  );
}

function WorkerRoute() {
  const stops = [
    { n: 1, t: "10:00 AM", who: "Ahmed, G-13", d: "1.8km", svc: "AC Repair" },
    { n: 2, t: "12:30 PM", who: "Fatima, G-10", d: "2.1km", svc: "AC Service" },
    { n: 3, t: "3:00 PM", who: "Bilal, F-7", d: "3.4km", svc: "Electrician" },
  ];
  return (
    <ScreenScroll>
      <div className="pt-2">
        <h2 className="text-xl font-bold">Aaj ka Route 🗺️</h2>
        <p className="text-xs text-muted-foreground">AI Optimized</p>
      </div>

      <div className="relative h-44 rounded-2xl overflow-hidden border border-white/5 bg-gradient-to-br from-navy-elev to-amber-soft">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(0deg, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d="M 15 25 Q 40 60 55 50 Q 75 40 85 80"
            stroke="rgb(255 179 71)"
            strokeWidth="0.7"
            strokeDasharray="2 2"
            fill="none"
          />
        </svg>
        {[
          { x: 12, y: 22, n: 1 },
          { x: 52, y: 48, n: 2 },
          { x: 82, y: 78, n: 3 },
        ].map((p) => (
          <div
            key={p.n}
            className="absolute h-7 w-7 rounded-full bg-amber text-navy grid place-items-center text-xs font-bold ring-4 ring-amber/30"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {p.n}
          </div>
        ))}
      </div>

      {stops.map((s) => (
        <Card key={s.n}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-soft text-amber grid place-items-center font-bold">
              {s.n}
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {s.t} — {s.svc}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {s.who} ({s.d})
              </div>
            </div>
          </div>
        </Card>
      ))}

      <Card>
        <div className="text-[11px] text-muted-foreground">
          ⏱️ 30 min buffer included between jobs
        </div>
      </Card>

      <Card className="border-emerald/30 bg-emerald-soft">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald" />
          <span className="text-sm font-semibold">AI Tip</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Yeh route 40% time bachayega ⚡ — AI ne automatically group kiya
        </p>
      </Card>
    </ScreenScroll>
  );
}

function WorkerProfile() {
  return (
    <ScreenScroll>
      <h2 className="text-xl font-bold pt-2">Profile</h2>
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-amber-soft grid place-items-center text-xl font-bold text-amber">
            A
          </div>
          <div>
            <div className="font-bold">Ali AC Tech</div>
            <div className="text-[11px] text-muted-foreground">
              ⭐ 4.8 · 247 jobs · Member Jan 2023
            </div>
            <div className="mt-1 flex gap-1">
              <Pill tone="emerald">On-Time 96%</Pill>
              <Pill tone="emerald">Low Risk 🟢</Pill>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-2">Specializations</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            "❄️ AC Repair",
            "⚙️ Complex Jobs",
            "🔧 Plumbing",
          ].map((s) => (
            <Pill key={s} tone="amber">
              {s}
            </Pill>
          ))}
        </div>
        <div className="mt-3">
          <Pill tone="emerald">✅ Complex Jobs Certified</Pill>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-2">Documents</div>
        {["CNIC", "Background Check", "Skill Certificate"].map((d) => (
          <div
            key={d}
            className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 text-sm"
          >
            <span>{d}</span>
            <Pill tone="emerald">✅ Verified</Pill>
          </div>
        ))}
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-2">Availability</div>
        <div className="grid grid-cols-7 gap-1.5">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <button
              key={i}
              className={`aspect-square rounded-lg text-xs font-semibold ${
                i === 6
                  ? "bg-white/5 text-muted-foreground"
                  : "bg-amber text-navy"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </Card>
    </ScreenScroll>
  );
}

/* ───────────────── nav ───────────────── */

function BottomNav<T extends string>({
  items,
  current,
  set,
  accent,
}: {
  items: { key: T; icon: React.ReactNode; label: string }[];
  current: T;
  set: (k: T) => void;
  accent: "emerald" | "amber";
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-popover/95 backdrop-blur border-t border-white/5 px-2 pt-2 pb-3 z-30">
      <div className="grid grid-cols-4 gap-1">
        {items.map((it) => {
          const on = current === it.key;
          const color =
            accent === "emerald"
              ? on
                ? "text-emerald"
                : "text-muted-foreground"
              : on
                ? "text-amber"
                : "text-muted-foreground";
          return (
            <button
              key={it.key}
              onClick={() => set(it.key)}
              className={`flex flex-col items-center gap-1 py-1.5 rounded-xl transition-all ${color}`}
            >
              <div
                className={`h-6 w-6 grid place-items-center ${
                  on ? "scale-110" : ""
                }`}
              >
                {it.icon}
              </div>
              <span className="text-[10px] font-semibold">{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────── root app ───────────────── */

export function HaazirApp() {
  const [role, setRole] = useState<Role>("customer");
  const [cs, setCs] = useState<CustomerScreen>("home");
  const [ws, setWs] = useState<WorkerScreen>("jobs");
  const [trace, setTrace] = useState(false);

  const goCustomer = (s: CustomerScreen) => setCs(s);

  const customerNav = [
    { key: "home" as const, icon: <Home className="h-5 w-5" />, label: "Home" },
    {
      key: "bookings" as const,
      icon: <ClipboardList className="h-5 w-5" />,
      label: "Bookings",
    },
    {
      key: "dispute" as const,
      icon: <Siren className="h-5 w-5" />,
      label: "Disputes",
    },
    {
      key: "profile" as const,
      icon: <User className="h-5 w-5" />,
      label: "Profile",
    },
  ];

  const workerNav = [
    {
      key: "jobs" as const,
      icon: <Briefcase className="h-5 w-5" />,
      label: "Jobs",
    },
    {
      key: "earnings" as const,
      icon: <Wallet className="h-5 w-5" />,
      label: "Kamai",
    },
    {
      key: "route" as const,
      icon: <MapIcon className="h-5 w-5" />,
      label: "Route",
    },
    {
      key: "profile" as const,
      icon: <User className="h-5 w-5" />,
      label: "Profile",
    },
  ];

  return (
    <div className="phone-frame flex flex-col">
      <RoleSwitcher role={role} setRole={setRole} />

      {role === "customer" ? (
        <>
          {cs === "home" && (
            <HomeScreen go={goCustomer} openTrace={() => setTrace(true)} />
          )}
          {cs === "results" && <ResultsScreen go={goCustomer} />}
          {cs === "pricing" && <PricingScreen go={goCustomer} />}
          {cs === "confirm" && <ConfirmScreen go={goCustomer} />}
          {cs === "tracking" && <TrackingScreen go={goCustomer} />}
          {cs === "feedback" && <FeedbackScreen />}
          {cs === "dispute" && <DisputeScreen />}
          {cs === "fallback" && <FallbackScreen go={goCustomer} />}
          {cs === "bookings" && <BookingsScreen go={goCustomer} />}
          {cs === "profile" && <CustomerProfile />}

          <AgentTraceDrawer
            open={trace}
            onClose={() => setTrace(false)}
            onComplete={() => {
              setTrace(false);
              setCs("results");
            }}
          />
          <BottomNav
            items={customerNav}
            current={cs as never}
            set={(k) => setCs(k as CustomerScreen)}
            accent="emerald"
          />
        </>
      ) : (
        <>
          {ws === "jobs" && <WorkerJobs />}
          {ws === "earnings" && <WorkerEarnings />}
          {ws === "route" && <WorkerRoute />}
          {ws === "profile" && <WorkerProfile />}
          <BottomNav
            items={workerNav}
            current={ws}
            set={setWs}
            accent="amber"
          />
        </>
      )}
    </div>
  );
}
