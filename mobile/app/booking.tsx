import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { AgentLog, confirmBooking, formatApiError, getAgentLogs, requireUserId } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useMockData } from '../context/MockDataContext';
import { makeMockBookingResult } from '../data/mockData';
import BookingReceipt from '../components/BookingReceipt';
import PriceBreakdown from '../components/PriceBreakdown';
import AgentLogViewer from '../components/AgentLogViewer';

const PAYMENT_METHODS = [
  { id: 'jazzcash', label: 'JazzCash', icon: 'phone-portrait-outline' as const },
  { id: 'easypaisa', label: 'Easypaisa', icon: 'wallet-outline' as const },
  { id: 'cash', label: 'Cash', icon: 'cash-outline' as const },
];

export default function BookingScreen() {
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const router = useRouter();
  const { providerData, priceData, requestId, confirmedData } = useLocalSearchParams<{
    providerData: string; priceData: string; requestId: string; confirmedData: string;
  }>();

  const provider = providerData ? JSON.parse(providerData) : null;
  const pricing = priceData ? JSON.parse(priceData) : null;
  const insets = useSafeAreaInsets();

  const [paymentMethod, setPaymentMethod] = useState('jazzcash');
  const [urgent, setUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState<any>(() => {
    if (!confirmedData) return null;
    try { return JSON.parse(confirmedData as string); } catch { return null; }
  });
  const [showLogs, setShowLogs] = useState(false);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (!showLogs || !requestId) return;
    let cancelled = false;
    setLogsLoading(true);
    getAgentLogs(requestId)
      .then((rows) => { if (!cancelled) setAgentLogs(rows); })
      .catch(() => { if (!cancelled) setAgentLogs([]); })
      .finally(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [showLogs, requestId]);

  if (!provider) return (
    <View style={styles.center}>
      <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
      <Text style={styles.errorText}>Provider data missing</Text>
    </View>
  );

  const urgentFee = urgent ? Math.round((pricing?.total || 1000) * 0.20) : 0;
  const finalTotal = (pricing?.total || 1000) + urgentFee;

  const handleConfirm = async () => {
    if (!isMockMode && !user?.profileComplete) {
      Alert.alert('Profile incomplete', 'Booking confirm karne se pehle apna profile complete karein.', [{ text: 'Profile', onPress: () => router.push('/signup') }]);
      return;
    }
    setLoading(true);

    // ── Mock mode: instant demo booking ──────────────────────────────────────
    if (isMockMode) {
      await new Promise((r) => setTimeout(r, 900));
      setConfirmed(makeMockBookingResult(provider?.name, finalTotal, provider?.service));
      setLoading(false);
      return;
    }

    // ── Real mode ─────────────────────────────────────────────────────────────
    try {
      const result = await confirmBooking({ providerId: provider.id, userId: requireUserId(user), service: provider.service, time: 'tomorrow_morning', priceAccepted: finalTotal });
      setConfirmed(result);
    } catch (err: any) {
      Alert.alert('Error', formatApiError(err));
    }
    setLoading(false);
  };

  if (confirmed) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <BookingReceipt
          bookingId={confirmed.booking_id}
          provider={provider}
          confirmationMessage={confirmed.confirmation_message}
          receipt={confirmed.receipt}
          reminders={confirmed.reminders}
        />
        <TouchableOpacity
          style={[styles.trackBtn, Shadow.primary]}
          onPress={() => router.push({ pathname: '/tracking', params: { bookingId: confirmed.booking_id } })}
          activeOpacity={0.85}
        >
          <Ionicons name="navigate-outline" size={18} color={Colors.textInverse} />
          <Text style={styles.trackBtnText}>Service Track Karein</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Confirm Karein</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

        {/* Provider card */}
        <View style={[styles.providerCard, Shadow.sm]}>
          <View style={styles.providerAvatar}>
            <Ionicons name="person" size={26} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>{provider.name}</Text>
            <View style={styles.providerMeta}>
              <Ionicons name="star" size={13} color={Colors.warning} />
              <Text style={styles.metaText}>{provider.rating}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.metaText}>{provider.area}, {provider.city}</Text>
            </View>
            <Text style={styles.metaDistance}>{provider.distance_km?.toFixed(1)} km away</Text>
          </View>
          {provider.verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color={Colors.primary} />
            </View>
          )}
        </View>

        {pricing && <PriceBreakdown pricing={{ ...pricing, total: finalTotal }} />}

        {/* Urgent toggle */}
        <TouchableOpacity
          style={[styles.urgentToggle, urgent && styles.urgentToggleActive]}
          onPress={() => setUrgent(!urgent)}
          activeOpacity={0.85}
        >
          <Ionicons name="flash" size={20} color={urgent ? Colors.warning : Colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.urgentLabel, urgent && styles.urgentLabelActive]}>Jaldi chahiye?</Text>
            <Text style={styles.urgentSub}>+20% extra — priority scheduling</Text>
          </View>
          <View style={[styles.toggle, urgent && styles.toggleActive]}>
            <View style={[styles.toggleThumb, urgent && styles.toggleThumbActive]} />
          </View>
        </TouchableOpacity>

        {/* Payment */}
        <Text style={styles.sectionLabel}>Payment Method</Text>
        <View style={styles.paymentRow}>
          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.paymentBtn, paymentMethod === m.id && styles.paymentBtnActive]}
              onPress={() => setPaymentMethod(m.id)}
              activeOpacity={0.8}
            >
              <Ionicons name={m.icon} size={20} color={paymentMethod === m.id ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.paymentLabel, paymentMethod === m.id && styles.paymentLabelActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Total */}
        <View style={[styles.totalCard, Shadow.sm]}>
          <Text style={styles.totalLabel}>Kul Rakam</Text>
          <Text style={styles.totalValue}>Rs {finalTotal.toLocaleString()}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>PAKKA booking confirm kar raha hai...</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.confirmBtn, Shadow.primary]} onPress={handleConfirm} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle-outline" size={20} color={Colors.textInverse} />
            <Text style={styles.confirmText}>Booking Confirm Karo!</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logsToggle} onPress={() => setShowLogs(!showLogs)}>
          <Text style={styles.logsToggleText}>{showLogs ? 'Logs Chhupayein' : 'Agent Logs'}</Text>
        </TouchableOpacity>
        {showLogs && (
          logsLoading ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} /> :
          agentLogs.length > 0 ? <AgentLogViewer logs={agentLogs} expanded /> :
          <Text style={styles.logsEmpty}>{requestId ? 'Is request ke logs abhi available nahi.' : 'Request ID missing.'}</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.background },
  errorText: { color: Colors.danger, fontSize: FontSize.md },

  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse },

  body: { flex: 1 },
  content: { padding: Spacing.md },

  // Provider card
  providerCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  providerAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  providerName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 4 },
  providerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  metaText: { color: Colors.textSecondary, fontSize: FontSize.xs },
  metaDot: { color: Colors.border, fontSize: FontSize.xs },
  metaDistance: { fontSize: FontSize.xs, color: Colors.textMuted },
  verifiedBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },

  // Urgent toggle
  urgentToggle: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  urgentToggleActive: { borderColor: Colors.warning, backgroundColor: Colors.warningDim },
  urgentLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  urgentLabelActive: { color: Colors.warning },
  urgentSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: Colors.border, padding: 2 },
  toggleActive: { backgroundColor: Colors.warning },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.textInverse },
  toggleThumbActive: { transform: [{ translateX: 18 }] },

  // Payment
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  paymentRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  paymentBtn: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.sm, alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  paymentBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  paymentLabel: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  paymentLabelActive: { color: Colors.primary },

  // Total
  totalCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  totalLabel: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  totalValue: { color: Colors.primary, fontSize: FontSize.xxl, fontWeight: FontWeight.black },

  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md, gap: Spacing.sm },
  loadingText: { color: Colors.primary, fontSize: FontSize.sm },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    height: 56, marginBottom: Spacing.md,
  },
  confirmText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  trackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    height: 56, marginTop: Spacing.md,
  },
  trackBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: FontWeight.bold },

  logsToggle: { alignItems: 'center', padding: Spacing.sm },
  logsToggleText: { color: Colors.textMuted, fontSize: FontSize.sm },
  logsEmpty: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', padding: Spacing.md },
});
