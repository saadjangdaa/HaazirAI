import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Share, Platform, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { AgentLog, getAgentLogsDetail, getRecentAgentLogs, RecentLogsEntry } from '../services/api';

const POLL_INTERVAL_MS = 5000;

// ─── Demo pipeline data ────────────────────────────────────────────────────────

const DEMO_TRACES: AgentLog[] = [
  {
    agent_name:       'SAMAJH',
    agent_name_urdu:  'سمجھ',
    start_time:       new Date(Date.now() - 5000).toISOString(),
    end_time:         new Date(Date.now() - 4188).toISOString(),
    input_summary:    "User input: \"AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye\"\n\nLanguage detected: Urdu-English mixed\nSession ID: sess_demo_001",
    output_summary:   "service_type: AC Repair\ncity: Islamabad\narea: G-13\nurgency: high\nscheduled_time: tomorrow_morning\nlanguage: ur_en\nconfidence: 0.92",
    decision_made:    'Intent extracted successfully. Structured request created from natural language input.',
    confidence:       0.92,
    fallback_used:    false,
    time_seconds:     0.812,
  },
  {
    agent_name:       'DHUNDHO',
    agent_name_urdu:  'ڈھونڈو',
    start_time:       new Date(Date.now() - 4100).toISOString(),
    end_time:         new Date(Date.now() - 3488).toISOString(),
    input_summary:    "service_type: AC Repair\ncity: Islamabad\narea: G-13\nurgency: high\ncomplexity: intermediate\nrequired_certs: []\nmax_radius_km: 10",
    output_summary:   "providers_found: 8\nfilters_applied: [service=AC Repair, city=Islamabad, available=true, radius≤10km]\ntop_result: Muhammad Ali AC Services (dist: 2.1km, rating: 4.8)\nfallback_triggered: false",
    decision_made:    'Queried Firestore with 4 filters. Returned 8 matching, available providers within 10km radius.',
    confidence:       1.0,
    fallback_used:    false,
    time_seconds:     0.612,
  },
  {
    agent_name:       'CHUNNO',
    agent_name_urdu:  'چُنّو',
    start_time:       new Date(Date.now() - 3400).toISOString(),
    end_time:         new Date(Date.now() - 2779).toISOString(),
    input_summary:    "providers_to_rank: 8\nscoring_factors: [rating×0.25, distance×0.20, completion_rate×0.15, price×0.15, reviews×0.10, verified×0.10, urgency_match×0.05]\nurgency: high",
    output_summary:   "ranked_provider: Muhammad Ali AC Services\nfinal_score: 0.847\nalternative: Bilal AC & Refrigeration (score: 0.814)\nwarnings_generated: 1 (Sajid Mehmood — low completion rate)\ntotal_ranked: 8",
    decision_made:    '8-factor weighted scoring applied. Top provider selected with 0.847 composite score. 1 provider flagged.',
    confidence:       0.95,
    fallback_used:    false,
    time_seconds:     0.621,
  },
  {
    agent_name:       'HIFAZAT',
    agent_name_urdu:  'حفاظت',
    start_time:       new Date(Date.now() - 2700).toISOString(),
    end_time:         new Date(Date.now() - 2203).toISOString(),
    input_summary:    "providers_to_check: 8\ncustomer_id: cust_demo_001\ncheck_types: [global_blacklist, dispute_history, trust_score, identity_verified]\nstrict_mode: false",
    output_summary:   "blocked: 0\nwarned: 2 (Sajid Mehmood — low completion, Khalid R. — 1 past dispute)\napproved: 6\nglobal_flags: 0\ncustomer_risk_score: low",
    decision_made:    'Trust check complete. 0 providers globally blacklisted. 6 cleared for booking. Customer risk: low.',
    confidence:       0.90,
    fallback_used:    false,
    time_seconds:     0.497,
  },
  {
    agent_name:       'HISAAB',
    agent_name_urdu:  'حساب',
    start_time:       new Date(Date.now() - 2100).toISOString(),
    end_time:         new Date(Date.now() - 1598).toISOString(),
    input_summary:    "provider: Muhammad Ali AC Services\nbase_price: Rs 1,600\njob_complexity: intermediate\nurgency: high\ndistance_km: 2.1\ncustomer_loyalty_tier: standard",
    output_summary:   "total_customer: Rs 1,580\nprovider_earnings: Rs 1,422\nplatform_fee: Rs 158 (10%)\nsurge_factor: 1.2x (high urgency)\nloyalty_discount: none\nbudget_alternative: Khalid AC — Rs 1,200",
    decision_made:    'Price calculated with 1.2× urgency surge. No loyalty discount. Budget alternative flagged.',
    confidence:       0.98,
    fallback_used:    false,
    time_seconds:     0.502,
  },
  {
    agent_name:       'PAKKA',
    agent_name_urdu:  'پکّا',
    start_time:       new Date(Date.now() - 1500).toISOString(),
    end_time:         new Date(Date.now() - 802).toISOString(),
    input_summary:    "provider_id: prov_ali_ac_001\ncustomer_id: cust_demo_001\nservice: AC Repair\nscheduled_time: 2025-06-01T05:00:00Z\nprice: Rs 1,580\nlocation: G-13, Islamabad",
    output_summary:   "booking_id: HAZ-20250601-A3B4C5\nstatus: confirmed\nslot_conflict: none\nprovider_notified: true\ncustomer_notified: true\nreminders_set: [T-24h, T-1h]\neta_minutes: 18",
    decision_made:    'Booking confirmed. No slot conflict. Push notifications sent. Reminders scheduled at T-24h and T-1h.',
    confidence:       0.97,
    fallback_used:    false,
    time_seconds:     0.698,
  },
];

// ─── Agent theme palette ───────────────────────────────────────────────────────

const AGENT_THEME: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  SAMAJH:  { bg: '#E6FAF5', border: '#00A37A', text: '#007A5C', icon: 'bulb-outline' },
  DHUNDHO: { bg: '#E0F2FE', border: '#0284C7', text: '#0369A1', icon: 'search-outline' },
  CHUNNO:  { bg: '#F0FDF4', border: '#16A34A', text: '#15803D', icon: 'trophy-outline' },
  HIFAZAT: { bg: '#FFF7ED', border: '#EA580C', text: '#C2410C', icon: 'shield-checkmark-outline' },
  HISAAB:  { bg: '#FAF5FF', border: '#9333EA', text: '#7E22CE', icon: 'calculator-outline' },
  PAKKA:   { bg: '#ECFDF5', border: '#059669', text: '#047857', icon: 'checkmark-circle-outline' },
  MOLTOL:  { bg: '#FFFBEB', border: '#D97706', text: '#B45309', icon: 'swap-horizontal-outline' },
  JHAGRA:  { bg: '#FEF2F2', border: '#DC2626', text: '#B91C1C', icon: 'hammer-outline' },
  REPORT:  { bg: '#ECFEFF', border: '#0891B2', text: '#0E7490', icon: 'document-text-outline' },
};

const DEFAULT_THEME = { bg: '#F6F7FB', border: '#999', text: '#444', icon: 'hardware-chip-outline' };

// ─── Agent Trace Card ─────────────────────────────────────────────────────────

function TraceCard({ log, index }: { log: AgentLog; index: number }) {
  const theme = AGENT_THEME[log.agent_name] || DEFAULT_THEME;
  const pct   = Math.round((log.confidence || 0) * 100);
  const confColor = pct >= 90 ? '#16A34A' : pct >= 70 ? Colors.warning : Colors.danger;

  const startLabel = log.start_time
    ? new Date(log.start_time).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--';

  return (
    <View style={[card.container, { borderColor: theme.border }]}>
      {/* ── Card header ── */}
      <View style={[card.header, { backgroundColor: theme.border }]}>
        <View style={card.headerLeft}>
          <View style={card.stepCircle}>
            <Text style={card.stepNum}>{index + 1}</Text>
          </View>
          <View>
            <Text style={card.agentEn}>{log.agent_name}</Text>
            <Text style={card.agentUr}>{log.agent_name_urdu}</Text>
          </View>
          <Ionicons name={theme.icon as any} size={18} color="rgba(255,255,255,0.85)" />
        </View>
        <View style={card.headerRight}>
          <Text style={card.timeText}>{startLabel}</Text>
          <View style={card.elapsedBadge}>
            <Text style={card.elapsedText}>{log.time_seconds?.toFixed(3)}s</Text>
          </View>
          {log.fallback_used && (
            <View style={card.fallbackBadge}>
              <Text style={card.fallbackText}>⚠ FALLBACK</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Body ── */}
      <View style={[card.body, { backgroundColor: theme.bg }]}>

        {/* Input block */}
        <View style={card.ioSection}>
          <View style={card.ioLabelRow}>
            <View style={card.ioLabelDot} />
            <Text style={card.ioLabelText}>INPUT</Text>
          </View>
          <View style={card.inputBox}>
            <Text style={card.inputText}>{log.input_summary}</Text>
          </View>
        </View>

        {/* Arrow */}
        <View style={card.arrowRow}>
          <View style={[card.arrowLine, { backgroundColor: theme.border }]} />
          <View style={[card.arrowHead, { backgroundColor: theme.border }]}>
            <Ionicons name="arrow-down" size={12} color="#fff" />
          </View>
          <View style={[card.arrowLine, { backgroundColor: theme.border }]} />
        </View>

        {/* Output block */}
        <View style={card.ioSection}>
          <View style={card.ioLabelRow}>
            <View style={[card.ioLabelDot, { backgroundColor: theme.border }]} />
            <Text style={[card.ioLabelText, { color: theme.text }]}>OUTPUT</Text>
          </View>
          <View style={[card.outputBox, { borderColor: theme.border + '66' }]}>
            <Text style={[card.outputText, { color: theme.text }]}>{log.output_summary}</Text>
          </View>
        </View>

        {/* Decision */}
        <View style={card.decisionRow}>
          <Ionicons name="checkmark-circle" size={14} color={theme.border} />
          <Text style={[card.decisionText, { color: theme.text }]}>{log.decision_made}</Text>
        </View>

        {/* Confidence bar */}
        <View style={card.confSection}>
          <View style={card.confLabelRow}>
            <Text style={card.confLabel}>Confidence</Text>
            <Text style={[card.confPct, { color: confColor }]}>{pct}%</Text>
          </View>
          <View style={card.confBarBg}>
            <View style={[card.confBarFill, { width: `${pct}%` as any, backgroundColor: confColor }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

const ALL_AGENTS = ['All', ...Object.keys(AGENT_THEME)];

// ─── Live dot ─────────────────────────────────────────────────────────────────

function LiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[s.liveDot, { opacity }]} />;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AgentTracesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();

  const [traces, setTraces]         = useState<AgentLog[]>([]);
  const [userInput, setUserInput]   = useState<string | null>(null);
  const [activeReqId, setActiveReqId] = useState<string | null>(null);
  const [recentList, setRecentList] = useState<RecentLogsEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [source, setSource]         = useState<'firestore' | 'mock' | 'demo'>('demo');
  const [filter, setFilter]         = useState('All');
  const [isLive, setIsLive]         = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch specific request logs ────────────────────────────────────────────
  const fetchByRequestId = useCallback(async (rid: string) => {
    try {
      const doc = await getAgentLogsDetail(rid);
      if (doc.logs?.length) {
        setTraces(doc.logs);
        setUserInput(doc.user_input || null);
        setActiveReqId(rid);
        setSource((doc.source as any) || 'firestore');
      }
    } catch {}
  }, []);

  // ── Fetch latest from /api/logs/recent, pick the newest entry ─────────────
  const fetchRecent = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await getRecentAgentLogs(20);
      setSource(res.source as any || 'firestore');
      if (res.requests?.length) {
        setRecentList(res.requests);
        const latest = res.requests[0];
        // Only update if this is a new request ID (avoid re-render on same data)
        setActiveReqId(prev => {
          if (prev !== latest.request_id) {
            setTraces(latest.logs || []);
            setUserInput(latest.user_input || null);
          }
          return latest.request_id;
        });
        setIsLive(true);
      } else {
        // No real logs yet — fall back to demo
        setTraces(DEMO_TRACES);
        setUserInput(null);
        setActiveReqId(null);
        setSource('demo');
        setIsLive(false);
      }
    } catch {
      // API unreachable — show demo
      if (!quiet) {
        setTraces(DEMO_TRACES);
        setUserInput(null);
        setSource('demo');
        setIsLive(false);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    const rid = (requestId || '').trim();
    if (rid) {
      setLoading(true);
      fetchByRequestId(rid).finally(() => setLoading(false));
    } else {
      fetchRecent(false);
    }
  }, [requestId, fetchByRequestId, fetchRecent]);

  // ── Live polling (only in recent/live mode, not when a specific requestId is given) ──
  useEffect(() => {
    const rid = (requestId || '').trim();
    if (rid) return; // pinned to a specific request — no polling needed

    pollRef.current = setInterval(() => fetchRecent(true), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [requestId, fetchRecent]);

  const filtered = filter === 'All' ? traces : traces.filter(t => t.agent_name === filter);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalTime = traces.reduce((s, l) => s + (l.time_seconds || 0), 0).toFixed(2);
  const avgConf   = traces.length
    ? Math.round(traces.reduce((s, l) => s + (l.confidence || 0), 0) / traces.length * 100)
    : 0;
  const fallbacks = traces.filter(l => l.fallback_used).length;

  const handleExport = async () => {
    const text = traces.map((t, i) =>
      `[${i + 1}] ${t.agent_name} (${t.agent_name_urdu})\n` +
      `Time: ${t.time_seconds?.toFixed(3)}s | Confidence: ${Math.round((t.confidence || 0) * 100)}%\n` +
      `INPUT:\n${t.input_summary}\n\nOUTPUT:\n${t.output_summary}\n\nDECISION: ${t.decision_made}\n` +
      `${'─'.repeat(50)}`
    ).join('\n\n');
    try {
      if (Platform.OS !== 'web') {
        await Share.share({ message: `Haazir AI — Agent Traces\n${'═'.repeat(40)}\n\n${text}` });
      } else {
        Alert.alert('Export', `${traces.length} agent traces ready.\n\n${text.slice(0, 300)}...`);
      }
    } catch {}
  };

  const subTitle = source === 'demo'
    ? 'Demo pipeline · 6 agents'
    : activeReqId
      ? `${activeReqId.slice(0, 18)}… · ${source}`
      : `Live · ${source}`;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerTitleRow}>
            <Text style={s.headerTitle}>Agent Traces</Text>
            {isLive && !requestId && <LiveDot />}
          </View>
          <Text style={s.headerSub}>{subTitle}</Text>
        </View>
        <TouchableOpacity style={s.exportBtn} onPress={handleExport} activeOpacity={0.8}>
          <Ionicons name="share-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Recent requests picker (live mode only) ── */}
        {!requestId && recentList.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.recentScroll}
            contentContainerStyle={{ paddingRight: Spacing.md }}
          >
            {recentList.map((entry) => (
              <TouchableOpacity
                key={entry.request_id}
                style={[s.recentChip, entry.request_id === activeReqId && s.recentChipActive]}
                onPress={() => {
                  setActiveReqId(entry.request_id);
                  setTraces(entry.logs || []);
                  setUserInput(entry.user_input || null);
                }}
                activeOpacity={0.75}
              >
                <Text style={[s.recentChipId, entry.request_id === activeReqId && s.recentChipIdActive]}>
                  {entry.request_id.slice(-8)}
                </Text>
                <Text style={s.recentChipMeta}>{entry.log_count} agents</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── User input display ── */}
        {userInput ? (
          <View style={s.userInputCard}>
            <View style={s.userInputHeader}>
              <Ionicons name="person-circle-outline" size={16} color={Colors.primary} />
              <Text style={s.userInputLabel}>User Request</Text>
            </View>
            <Text style={s.userInputText}>{userInput}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.xl }} />
        ) : null}

        {/* ── Stats row ── */}
        {traces.length > 0 && (
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statVal}>{traces.length}</Text>
              <Text style={s.statLbl}>Agents</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: Colors.primary }]}>{totalTime}s</Text>
              <Text style={s.statLbl}>Total Time</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: avgConf >= 90 ? '#16A34A' : Colors.warning }]}>{avgConf}%</Text>
              <Text style={s.statLbl}>Avg Confidence</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: fallbacks > 0 ? Colors.warning : '#16A34A' }]}>{fallbacks}</Text>
              <Text style={s.statLbl}>Fallbacks</Text>
            </View>
          </View>
        )}

        {/* ── Pipeline label ── */}
        <View style={s.pipelineLabel}>
          <Ionicons name="git-network-outline" size={14} color={Colors.primary} />
          <Text style={s.pipelineLabelText}>AI AGENT PIPELINE — INPUT → OUTPUT TRACES</Text>
        </View>

        {/* ── Filter chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={{ paddingRight: Spacing.md }}
        >
          {ALL_AGENTS.filter(name => name === 'All' || traces.some(t => t.agent_name === name)).map((name) => (
            <TouchableOpacity
              key={name}
              style={[s.filterChip, filter === name && s.filterChipActive]}
              onPress={() => setFilter(name)}
              activeOpacity={0.75}
            >
              {name !== 'All' && (
                <View style={[s.filterDot, { backgroundColor: AGENT_THEME[name]?.border || '#999' }]} />
              )}
              <Text style={[s.filterChipText, filter === name && s.filterChipTextActive]}>{name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Trace cards ── */}
        {filtered.length === 0 && !loading ? (
          <View style={s.empty}>
            <Ionicons name="layers-outline" size={40} color={Colors.border} />
            <Text style={s.emptyText}>Is agent ke koi traces nahi milein</Text>
          </View>
        ) : (
          filtered.map((trace, i) => (
            <TraceCard key={`${trace.agent_name}-${i}`} log={trace} index={traces.indexOf(trace)} />
          ))
        )}

        {/* ── Info footer ── */}
        <View style={s.infoFooter}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={s.infoFooterText}>
            {source === 'demo'
              ? 'Demo data — backend se connect hone ke baad real traces ayenge.'
              : isLive
                ? `Live Firestore — har ${POLL_INTERVAL_MS / 1000}s mein refresh. Request: ${activeReqId ?? '—'}`
                : `Firestore — Request ID: ${activeReqId ?? requestId ?? '—'}`}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
    ...Shadow.sm,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  headerCenter: { flex: 1, paddingHorizontal: Spacing.sm },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  exportBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primaryLight },

  // Live dot
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },

  // Recent requests picker
  recentScroll: { marginBottom: Spacing.md },
  recentChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    marginRight: 8, alignItems: 'center',
  },
  recentChipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  recentChipId: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  recentChipIdActive: { color: Colors.primary },
  recentChipMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },

  scroll: { flex: 1 },
  content: { padding: Spacing.md },

  // User input card
  userInputCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.primaryDim,
    ...Shadow.sm,
  },
  userInputHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  userInputLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  userInputText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, fontStyle: 'italic' },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.sm, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  statVal: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.textPrimary },
  statLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },

  // Pipeline label
  pipelineLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  pipelineLabelText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, letterSpacing: 1, textTransform: 'uppercase' },

  // Filter chips
  filterScroll: { marginBottom: Spacing.md },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  filterChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  filterChipTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.md },

  // Info footer
  infoFooter: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: Spacing.lg, padding: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoFooterText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16 },
});

// ─── Card styles ──────────────────────────────────────────────────────────────

const card = StyleSheet.create({
  container: {
    borderRadius: Radius.xl, borderWidth: 1.5,
    marginBottom: Spacing.lg, overflow: 'hidden',
    ...Shadow.card,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  stepNum: { fontSize: FontSize.sm, fontWeight: FontWeight.black, color: '#fff' },
  agentEn: { fontSize: FontSize.md, fontWeight: FontWeight.extrabold, color: '#fff', letterSpacing: 1 },
  agentUr: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.80)' },
  headerRight: { alignItems: 'flex-end', gap: 3 },
  timeText: { fontSize: 10, color: 'rgba(255,255,255,0.70)' },
  elapsedBadge: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 2,
  },
  elapsedText: { fontSize: 11, color: '#fff', fontWeight: FontWeight.bold },
  fallbackBadge: {
    backgroundColor: Colors.warningDim, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2,
  },
  fallbackText: { fontSize: 10, color: Colors.warning, fontWeight: FontWeight.bold },

  body: { padding: Spacing.md },

  // Input / Output sections
  ioSection: { marginBottom: Spacing.sm },
  ioLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  ioLabelDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textMuted },
  ioLabelText: { fontSize: 10, fontWeight: FontWeight.extrabold, color: Colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },

  inputBox: {
    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  inputText: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  arrowRow: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.xs },
  arrowLine: { flex: 1, height: 1.5, opacity: 0.4 },
  arrowHead: {
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 6,
  },

  outputBox: {
    borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.60)',
  },
  outputText: { fontSize: FontSize.xs, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  decisionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: Spacing.sm, padding: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.50)', borderRadius: Radius.md,
  },
  decisionText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },

  confSection: { marginTop: Spacing.sm },
  confLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  confLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.8 },
  confPct: { fontSize: 11, fontWeight: FontWeight.extrabold },
  confBarBg: { height: 6, backgroundColor: 'rgba(0,0,0,0.10)', borderRadius: 3 },
  confBarFill: { height: 6, borderRadius: 3 },
});
