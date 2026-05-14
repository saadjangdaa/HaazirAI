import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';
import { FullOrchestrationResponse, Provider, triggerBidding } from '../services/api';
import ProviderCard from '../components/ProviderCard';
import PriceBreakdown from '../components/PriceBreakdown';
import BiddingPanel from '../components/BiddingPanel';
import AgentLogViewer from '../components/AgentLogViewer';

const URGENCY_COLOR = { low: Colors.success, medium: Colors.warning, high: '#FF8C00', critical: Colors.danger };
const PIPELINE_STEPS = ['SAMAJH', 'DHUNDHO', 'CHUNNO', 'HISAAB'];

export default function ResultsScreen() {
  const router = useRouter();
  const { data } = useLocalSearchParams<{ data: string }>();
  const [result, setResult] = useState<FullOrchestrationResponse | null>(null);
  const [showBidding, setShowBidding] = useState(false);
  const [biddingLoading, setBiddingLoading] = useState(false);
  const [biddingResult, setBiddingResult] = useState<any>(null);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (data) setResult(JSON.parse(data));
  }, [data]);

  if (!result) return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;

  const intent = result.extracted_intent;
  const urgency = intent?.urgency || 'medium';
  const agents = result.agent_logs || [];

  const handleNegotiate = async () => {
    setBiddingLoading(true);
    setShowBidding(true);
    try {
      const res = await triggerBidding(result.request_id, 'user_001');
      setBiddingResult(res);
    } catch {
      setBiddingResult(null);
    }
    setBiddingLoading(false);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Pipeline Progress */}
      <View style={styles.pipeline}>
        {PIPELINE_STEPS.map((step, i) => {
          const done = i < agents.length;
          return (
            <React.Fragment key={step}>
              <View style={[styles.pipelineStep, done && styles.pipelineStepDone]}>
                <Text style={[styles.pipelineText, done && styles.pipelineTextDone]}>
                  {done ? '✅' : '⏳'} {step}
                </Text>
              </View>
              {i < PIPELINE_STEPS.length - 1 && <Text style={styles.pipelineArrow}>→</Text>}
            </React.Fragment>
          );
        })}
      </View>

      {result.emergency && (
        <View style={styles.emergencyBanner}>
          <Text style={styles.emergencyText}>🚨 EMERGENCY MODE — Fast Track Activated</Text>
        </View>
      )}

      {/* Intent Summary */}
      {intent && (
        <View style={styles.intentCard}>
          <View style={styles.intentRow}>
            <Text style={styles.intentLabel}>Service:</Text>
            <Text style={styles.intentValue}>{intent.service_type}</Text>
          </View>
          <View style={styles.intentRow}>
            <Text style={styles.intentLabel}>Location:</Text>
            <Text style={styles.intentValue}>{intent.location}, {intent.city}</Text>
          </View>
          <View style={styles.intentRow}>
            <Text style={styles.intentLabel}>Time:</Text>
            <Text style={styles.intentValue}>{intent.time_preference}</Text>
          </View>
          <View style={styles.intentRow}>
            <Text style={styles.intentLabel}>Urgency:</Text>
            <View style={[styles.urgencyBadge, { backgroundColor: URGENCY_COLOR[urgency] + '33' }]}>
              <Text style={[styles.urgencyText, { color: URGENCY_COLOR[urgency] }]}>
                {urgency.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Price Breakdown */}
      {result.price_breakdown && (
        <PriceBreakdown pricing={result.price_breakdown} />
      )}

      {/* Negotiate Button */}
      {!showBidding && (
        <TouchableOpacity style={styles.negotiateBtn} onPress={handleNegotiate}>
          <Text style={styles.negotiateBtnText}>🤝 MOLTOL: Negotiate Karo</Text>
          <Text style={styles.negotiateBtnSub}>Providers se bids mangwao aur best deal pao</Text>
        </TouchableOpacity>
      )}

      {/* Bidding Panel */}
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

      {/* Providers List */}
      <Text style={styles.sectionTitle}>
        Ranked Providers ({result.providers_ranked?.length || 0})
      </Text>
      {result.providers_ranked?.map((p, i) => (
        <ProviderCard
          key={p.id}
          provider={p}
          rank={i + 1}
          onSelect={() => handleSelectProvider(p)}
        />
      ))}

      {result.fallback && (
        <View style={styles.fallbackCard}>
          <Text style={styles.fallbackText}>⚠️ {result.fallback}</Text>
        </View>
      )}

      {/* Agent Logs Toggle */}
      <TouchableOpacity style={styles.logsToggle} onPress={() => setShowLogs(!showLogs)}>
        <Text style={styles.logsToggleText}>
          {showLogs ? '🔼 Logs Chhupayein' : '🔍 Agent Logs Dekhen (Judges)'}
        </Text>
      </TouchableOpacity>

      {showLogs && <AgentLogViewer logs={agents} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  pipeline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: Spacing.md },
  pipelineStep: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: Colors.surfaceElevated, marginBottom: 4 },
  pipelineStepDone: { backgroundColor: Colors.primaryDim },
  pipelineText: { fontSize: FontSize.xs, color: Colors.textMuted },
  pipelineTextDone: { color: Colors.primary },
  pipelineArrow: { color: Colors.textMuted, fontSize: FontSize.xs, marginHorizontal: 3 },
  emergencyBanner: { backgroundColor: Colors.dangerDim, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.danger },
  emergencyText: { color: Colors.danger, fontWeight: '800', fontSize: FontSize.md, textAlign: 'center' },
  intentCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  intentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  intentLabel: { color: Colors.textMuted, fontSize: FontSize.sm, width: 70 },
  intentValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  urgencyBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 2 },
  urgencyText: { fontSize: FontSize.xs, fontWeight: '700' },
  negotiateBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center' },
  negotiateBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.md },
  negotiateBtnSub: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.sm },
  fallbackCard: { backgroundColor: Colors.warningDim, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.warning },
  fallbackText: { color: Colors.warning, fontSize: FontSize.sm },
  logsToggle: { padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  logsToggleText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
