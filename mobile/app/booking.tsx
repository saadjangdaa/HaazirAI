import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { AgentLog, confirmBooking, formatApiError, getAgentLogs, requireUserId } from '../services/api';
import { useAuth } from '../context/AuthContext';
import BookingReceipt from '../components/BookingReceipt';
import PriceBreakdown from '../components/PriceBreakdown';
import AgentLogViewer from '../components/AgentLogViewer';

const PAYMENT_METHODS = [
  { id: 'jazzcash', label: 'JazzCash', icon: '📱' },
  { id: 'easypaisa', label: 'Easypaisa', icon: '💚' },
  { id: 'cash', label: 'Cash', icon: '💵' },
];

export default function BookingScreen() {
  const { user } = useAuth();
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
  // If arriving from voice booking with pre-confirmed data, show receipt immediately
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
      .then((rows) => {
        if (!cancelled) setAgentLogs(rows);
      })
      .catch(() => {
        if (!cancelled) setAgentLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showLogs, requestId]);

  if (!provider) return <View style={styles.center}><Text style={styles.errorText}>Provider data missing</Text></View>;

  const urgentFee = urgent ? Math.round((pricing?.total || 1000) * 0.20) : 0;
  const finalTotal = (pricing?.total || 1000) + urgentFee;

  const handleConfirm = async () => {
    if (!user?.profileComplete) {
      Alert.alert(
        'Profile incomplete',
        'Booking confirm karne se pehle apna profile complete karein.',
        [{ text: 'Profile', onPress: () => router.push('/signup') }]
      );
      return;
    }
    setLoading(true);
    try {
      const result = await confirmBooking({
        providerId: provider.id,
        userId: requireUserId(user),
        service: provider.service,
        time: 'tomorrow_morning',
        priceAccepted: finalTotal,
      });
      setConfirmed(result);
    } catch (err: any) {
      Alert.alert('Error', formatApiError(err));
    }
    setLoading(false);
  };

  if (confirmed) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <BookingReceipt
          bookingId={confirmed.booking_id}
          provider={provider}
          confirmationMessage={confirmed.confirmation_message}
          receipt={confirmed.receipt}
          reminders={confirmed.reminders}
        />
        <TouchableOpacity
          style={styles.trackBtn}
          onPress={() => router.push({ pathname: '/tracking', params: { bookingId: confirmed.booking_id } })}
        >
          <Text style={styles.trackBtnText}>📍 Service Track Karein</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.providerCard}>
        <Text style={styles.providerName}>{provider.name}</Text>
        <View style={styles.providerMeta}>
          <Text style={styles.metaText}>⭐ {provider.rating}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{provider.area}, {provider.city}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{provider.distance_km?.toFixed(1)} km</Text>
        </View>
        {provider.verified && <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✓ Verified</Text></View>}
      </View>

      {pricing && <PriceBreakdown pricing={{ ...pricing, total: finalTotal }} />}

      {/* Urgency Toggle */}
      <TouchableOpacity
        style={[styles.urgentToggle, urgent && styles.urgentToggleActive]}
        onPress={() => setUrgent(!urgent)}
      >
        <View style={styles.urgentLeft}>
          <Text style={styles.urgentIcon}>⚡</Text>
          <View>
            <Text style={[styles.urgentLabel, urgent && styles.urgentLabelActive]}>Jaldi chahiye?</Text>
            <Text style={styles.urgentSub}>+20% extra — priority scheduling</Text>
          </View>
        </View>
        <View style={[styles.toggle, urgent && styles.toggleActive]}>
          <Text style={styles.toggleText}>{urgent ? 'ON' : 'OFF'}</Text>
        </View>
      </TouchableOpacity>

      {/* Payment Method */}
      <Text style={styles.sectionLabel}>Payment Method:</Text>
      <View style={styles.paymentRow}>
        {PAYMENT_METHODS.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.paymentBtn, paymentMethod === m.id && styles.paymentBtnActive]}
            onPress={() => setPaymentMethod(m.id)}
          >
            <Text style={styles.paymentIcon}>{m.icon}</Text>
            <Text style={[styles.paymentLabel, paymentMethod === m.id && styles.paymentLabelActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total:</Text>
        <Text style={styles.totalValue}>Rs {finalTotal.toLocaleString()}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>PAKKA booking confirm kar raha hai...</Text>
        </View>
      ) : (
        <TouchableOpacity style={[styles.confirmBtn, Shadow.primary]} onPress={handleConfirm}>
          <Text style={styles.confirmText}>✅ Booking Confirm Karo!</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logsToggle} onPress={() => setShowLogs(!showLogs)}>
        <Text style={styles.logsToggleText}>{showLogs ? '🔼 Logs Chhupayein' : '🔍 Agent Logs'}</Text>
      </TouchableOpacity>
      {showLogs && (
        logsLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
        ) : agentLogs.length > 0 ? (
          <AgentLogViewer logs={agentLogs} expanded />
        ) : (
          <Text style={styles.logsEmpty}>
            {requestId ? 'Is request ke logs abhi available nahi.' : 'Request ID missing — pehle results se aayein.'}
          </Text>
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: Colors.danger },
  providerCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  providerName: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '700', marginBottom: 6 },
  providerMeta: { flexDirection: 'row', alignItems: 'center' },
  metaText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  metaDot: { color: Colors.textMuted, marginHorizontal: 4 },
  verifiedBadge: { marginTop: 6, backgroundColor: Colors.primaryDim, borderRadius: Radius.full, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 2 },
  verifiedText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '700' },
  urgentToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  urgentToggleActive: { borderColor: Colors.warning, backgroundColor: Colors.warningDim },
  urgentLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  urgentIcon: { fontSize: 24 },
  urgentLabel: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  urgentLabelActive: { color: Colors.warning },
  urgentSub: { color: Colors.textMuted, fontSize: FontSize.xs },
  toggle: { backgroundColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  toggleActive: { backgroundColor: Colors.warning },
  toggleText: { color: Colors.textPrimary, fontSize: FontSize.xs, fontWeight: '700' },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm },
  paymentRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  paymentBtn: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  paymentBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
  paymentIcon: { fontSize: 20, marginBottom: 2 },
  paymentLabel: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  paymentLabelActive: { color: Colors.primary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.cardBg, borderRadius: Radius.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight },
  totalLabel: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '600' },
  totalValue: { color: Colors.primary, fontSize: FontSize.xxl, fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md, gap: Spacing.sm },
  loadingText: { color: Colors.primary, fontSize: FontSize.sm },
  confirmBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md + 2, alignItems: 'center', marginBottom: Spacing.md },
  confirmText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
  trackBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.primary },
  trackBtnText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  logsToggle: { alignItems: 'center', padding: Spacing.sm },
  logsToggleText: { color: Colors.textMuted, fontSize: FontSize.sm },
  logsEmpty: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', padding: Spacing.md },
});
