import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { speakText, stopSpeaking, getIsSpeaking } from '../services/voiceSpeech';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import {
  FullOrchestrationResponse, Provider, triggerBidding, formatApiError, requireUserId,
  getJobBids, acceptBid, WorkerBid,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import ProviderCard from '../components/ProviderCard';
import PriceBreakdown from '../components/PriceBreakdown';
import BiddingPanel from '../components/BiddingPanel';
import AgentLogViewer from '../components/AgentLogViewer';

const URGENCY_COLOR: Record<string, string> = {
  low: Colors.success, medium: Colors.warning, high: '#FF6B35', critical: Colors.danger,
};
const PIPELINE_STEPS = ['SAMAJH', 'DHUNDHO', 'CHUNNO', 'HISAAB'];

const ResultsScreen = () => {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, jobRequestId } = useLocalSearchParams<{ data: string; jobRequestId?: string }>();
  const [result, setResult] = useState<FullOrchestrationResponse | null>(null);
  const [showBidding, setShowBidding] = useState(false);
  const [biddingLoading, setBiddingLoading] = useState(false);
  const [biddingResult, setBiddingResult] = useState<any>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Real marketplace bid polling
  const [realBids, setRealBids] = useState<WorkerBid[]>([]);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (data) setResult(JSON.parse(data)); }, [data]);

  // Poll for real bids every 5s when jobRequestId is present
  useEffect(() => {
    if (!jobRequestId) return;
    setShowBidding(true);
    const poll = async () => {
      try {
        const res = await getJobBids(jobRequestId);
        setRealBids(res.bids || []);
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobRequestId]);

  if (!result) return (
    <View style={styles.center}>
      <ActivityIndicator color={Colors.primary} size="large" />
      <Text style={styles.loadingText}>Results load ho rahe hain...</Text>
    </View>
  );

  const intent = result.extracted_intent;
  const urgency = intent?.urgency || 'medium';
  const agents = result.agent_logs || [];
  const doneCount = agents.length;
  const providerCount = result.providers_ranked?.length || 0;

  const handleSpeak = async () => {
    const already = await getIsSpeaking();
    if (already || speaking) { await stopSpeaking(); setSpeaking(false); return; }
    const bp = result?.best_provider;
    if (!bp) return;
    const price = result?.price_breakdown?.total || 0;
    const service = intent?.service_type || 'service';
    const msg = `${bp.name} best match hai ${service} ke liye. Rating ${bp.rating}. Price ${price} rupees.`;
    setSpeaking(true);
    speakText(msg, () => setSpeaking(false));
  };

  const handleNegotiate = async () => {
    setBiddingLoading(true);
    setShowBidding(true);
    try {
      const res = await triggerBidding(result.request_id, requireUserId(user));
      setBiddingResult(res);
    } catch (e) {
      setBiddingResult(null);
      Alert.alert('Error', formatApiError(e));
    }
    setBiddingLoading(false);
  };

  const handleAcceptRealBid = async (bid: WorkerBid) => {
    if (!jobRequestId || !user?.id) return;
    setAcceptingBidId(bid.bid_id);
    try {
      if (pollRef.current) clearInterval(pollRef.current);
      const res = await acceptBid(jobRequestId, bid.bid_id, user.id, 'cash');
      router.replace({
        pathname: '/booking',
        params: {
          bookingId: res.booking_id,
          providerData: JSON.stringify(bid),
          confirmationMessage: res.confirmation_message,
        },
      });
    } catch (e) {
      Alert.alert('Error', formatApiError(e));
      setAcceptingBidId(null);
    }
  };

  const handleSelectProvider = (provider: Provider) => {
    router.push({
      pathname: '/booking',
      params: {
        providerData: JSON.stringify(provider),
        priceData: JSON.stringify(result.price_breakdown),
        requestId: result.request_id,
      },
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Results</Text>
          {intent && <Text style={styles.headerSub}>{intent.service_type} · {intent.location}</Text>}
        </View>
        {result.best_provider && (
          <TouchableOpacity style={[styles.ttsBtn, speaking && styles.ttsBtnActive]} onPress={handleSpeak}>
            <Ionicons name={speaking ? 'volume-mute-outline' : 'volume-medium-outline'} size={20} color={Colors.textInverse} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pipelineCard, Shadow.sm]}>
          <Text style={styles.pipelineTitle}>AI Pipeline</Text>
          <View style={styles.pipelineRow}>
            {PIPELINE_STEPS.map((step, i) => {
              const done = i < doneCount;
              return (
                <React.Fragment key={step}>
                  <View style={[styles.pipelineStep, done && styles.pipelineStepDone]}>
                    {done
                      ? <Ionicons name="checkmark" size={12} color={Colors.primary} />
                      : <Ionicons name="time-outline" size={12} color={Colors.textMuted} />}
                    <Text style={[styles.pipelineText, done && styles.pipelineTextDone]}>{step}</Text>
                  </View>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <View style={[styles.pipelineConnector, done && i < doneCount - 1 && styles.pipelineConnectorDone]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {result.clarification_needed && result.clarification_question && (
          <View style={styles.clarificationCard}>
            <Text style={styles.clarificationTitle}>Ek aur detail</Text>
            <Text style={styles.clarificationText}>{result.clarification_question}</Text>
            <Text style={styles.clarificationSub}>
              Neeche technicians phir bhi dikhaye gaye hain — koi card tap karke booking shuru karein.
            </Text>
          </View>
        )}

        {result.emergency && (
          <View style={styles.emergencyBanner}>
            <Ionicons name="warning" size={18} color={Colors.danger} />
            <Text style={styles.emergencyText}>EMERGENCY MODE — Fast Track Activated</Text>
          </View>
        )}

        {intent && (
          <View style={[styles.intentCard, Shadow.sm]}>
            <View style={styles.intentRow}>
              <Ionicons name="construct-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.intentLabel}>Service</Text>
              <Text style={styles.intentValue}>{intent.service_type}</Text>
            </View>
            <View style={styles.intentRow}>
              <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.intentLabel}>Location</Text>
              <Text style={styles.intentValue}>{intent.location}, {intent.city}</Text>
            </View>
            <View style={styles.intentRow}>
              <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.intentLabel}>Time</Text>
              <Text style={styles.intentValue}>{intent.time_preference}</Text>
            </View>
            <View style={styles.intentRow}>
              <Ionicons name="speedometer-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.intentLabel}>Urgency</Text>
              <View style={[styles.urgencyBadge, { backgroundColor: (URGENCY_COLOR[urgency] || Colors.warning) + '22' }]}>
                <Text style={[styles.urgencyText, { color: URGENCY_COLOR[urgency] || Colors.warning }]}>
                  {urgency.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {result.price_breakdown && <PriceBreakdown pricing={result.price_breakdown} />}

        {/* Real marketplace bids (when jobRequestId present) */}
        {jobRequestId ? (
          <View style={styles.realBidsSection}>
            <View style={styles.realBidsHeader}>
              <Ionicons name="radio-outline" size={16} color={Colors.primary} />
              <Text style={styles.realBidsTitle}>Workers ki Bids</Text>
              {realBids.length === 0 && (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 8 }} />
              )}
            </View>
            {realBids.length === 0 ? (
              <Text style={styles.realBidsWaiting}>
                Workers ko notify kar diya gaya — bids aa rahi hain...
              </Text>
            ) : (
              realBids.map((bid) => (
                <View key={bid.bid_id} style={[styles.realBidCard, bid.recommended && styles.realBidCardTop]}>
                  {bid.recommended && (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedText}>⭐ Best Deal</Text>
                    </View>
                  )}
                  <View style={styles.realBidRow}>
                    <View>
                      <Text style={styles.realBidName}>{bid.provider_name}</Text>
                      {bid.rating > 0 && (
                        <Text style={styles.realBidRating}>⭐ {bid.rating.toFixed(1)}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.realBidPrice}>Rs {bid.price.toLocaleString()}</Text>
                      <Text style={styles.realBidEta}>{bid.eta_minutes} min</Text>
                    </View>
                  </View>
                  {bid.message ? (
                    <Text style={styles.realBidMsg} numberOfLines={2}>{bid.message}</Text>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.acceptBidBtn, acceptingBidId === bid.bid_id && { opacity: 0.6 }]}
                    onPress={() => handleAcceptRealBid(bid)}
                    disabled={!!acceptingBidId}
                    activeOpacity={0.85}
                  >
                    {acceptingBidId === bid.bid_id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.acceptBidBtnText}>✓ Is Ko Chunein</Text>
                    }
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        ) : (
          <>
            {!showBidding && (
              <TouchableOpacity style={[styles.negotiateBtn, Shadow.sm]} onPress={handleNegotiate} activeOpacity={0.85}>
                <Ionicons name="swap-horizontal-outline" size={18} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.negotiateBtnText}>MOLTOL: Negotiate Karo</Text>
                  <Text style={styles.negotiateBtnSub}>Providers se bids mangwao aur best deal pao</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </TouchableOpacity>
            )}
            {showBidding && (
              <BiddingPanel
                loading={biddingLoading}
                result={biddingResult}
                onSelectBid={(bid) => {
                  const provider = result.providers_ranked?.find((p) => p.id === bid.provider_id);
                  if (provider) handleSelectProvider(provider);
                }}
              />
            )}
          </>
        )}

        {/* Only show provider list in traditional flow (no jobRequestId) */}
        {!jobRequestId && (
        <>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Technicians / Providers ({providerCount})</Text>
          <View style={styles.sortPill}>
            <Ionicons name="star" size={11} color={Colors.warning} />
            <Text style={styles.sortPillText}>Best Match</Text>
          </View>
        </View>

        {providerCount === 0 ? (
          <View style={styles.emptyProviders}>
            <Text style={styles.emptyProvidersText}>
              Abhi koi technician nahi mila. Location ya service type badal kar dubara Haazir Karo try karein.
            </Text>
          </View>
        ) : (
          result.providers_ranked?.map((p, i) => (
            <ProviderCard
              key={p.id || `provider-${i}`}
              provider={p}
              rank={i + 1}
              onSelect={() => handleSelectProvider(p)}
            />
          ))
        )}

        {result.fallback && (
          <View style={styles.fallbackCard}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
            <Text style={styles.fallbackText}>{result.fallback}</Text>
          </View>
        )}
        </>
        )} {/* end !jobRequestId */}

        <TouchableOpacity style={styles.logsToggle} onPress={() => setShowLogs(!showLogs)} activeOpacity={0.75}>
          <Ionicons name={showLogs ? 'chevron-up' : 'flask-outline'} size={14} color={Colors.textMuted} />
          <Text style={styles.logsToggleText}>{showLogs ? 'Logs Chhupayein' : 'Agent Logs Dekhen (Judges)'}</Text>
        </TouchableOpacity>

        {showLogs && <AgentLogViewer logs={agents} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.background },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm },

  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)' },
  ttsBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  ttsBtnActive: { backgroundColor: 'rgba(255,255,255,0.35)' },

  body: { flex: 1 },
  bodyContent: { padding: Spacing.md },

  pipelineCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  pipelineTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  pipelineRow: { flexDirection: 'row', alignItems: 'center' },
  pipelineStep: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.inputBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  pipelineStepDone: { backgroundColor: Colors.primaryLight },
  pipelineText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold },
  pipelineTextDone: { color: Colors.primary },
  pipelineConnector: { flex: 1, height: 2, backgroundColor: Colors.border, marginHorizontal: 2 },
  pipelineConnectorDone: { backgroundColor: Colors.primary },

  clarificationCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  clarificationTitle: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.md, marginBottom: 4 },
  clarificationText: { color: Colors.textPrimary, fontSize: FontSize.sm, marginBottom: 6 },
  clarificationSub: { color: Colors.textMuted, fontSize: FontSize.xs },

  emergencyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.dangerDim, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.danger,
  },
  emergencyText: { color: Colors.danger, fontWeight: FontWeight.bold, fontSize: FontSize.md, flex: 1 },

  intentCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
    gap: 8,
  },
  intentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  intentLabel: { color: Colors.textMuted, fontSize: FontSize.sm, width: 62 },
  intentValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, flex: 1 },
  urgencyBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  urgencyText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  negotiateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.primaryDim,
  },
  negotiateBtnText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  negotiateBtnSub: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 1 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sortPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningDim, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  sortPillText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.bold },

  emptyProviders: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyProvidersText: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },

  fallbackCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.warningDim, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.warning,
  },
  fallbackText: { color: Colors.warning, fontSize: FontSize.sm, flex: 1 },

  logsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: Spacing.md },
  logsToggleText: { color: Colors.textMuted, fontSize: FontSize.sm },

  // Real marketplace bids
  realBidsSection: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.card,
  },
  realBidsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  realBidsTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, flex: 1 },
  realBidsWaiting: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: 16 },
  realBidCard: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  realBidCardTop: { borderColor: Colors.primary, borderWidth: 2 },
  recommendedBadge: {
    backgroundColor: Colors.primary + '18', borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6,
  },
  recommendedText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold },
  realBidRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  realBidName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  realBidRating: { fontSize: FontSize.xs, color: Colors.textMuted },
  realBidPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success },
  realBidEta: { fontSize: FontSize.xs, color: Colors.textMuted },
  realBidMsg: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 8 },
  acceptBidBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 10, alignItems: 'center',
  },
  acceptBidBtnText: { fontSize: FontSize.sm, color: '#fff', fontWeight: FontWeight.semibold },
});

export default ResultsScreen;
