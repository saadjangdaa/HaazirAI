import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DisputeResolution,
  formatApiError,
  getUserBookings,
  isLoginRelatedError,
  resolveUserId,
  submitDispute,
} from '../../services/api';
import { useMockData } from '../../context/MockDataContext';
import { MOCK_CUSTOMER_BOOKINGS } from '../../data/mockData';

const DISPUTE_TYPES = [
  { id: 'noshow', label: 'Provider No-Show', icon: '😤' },
  { id: 'price', label: 'Price Disagreement', icon: '💰' },
  { id: 'quality', label: 'Quality Complaint', icon: '😞' },
  { id: 'incomplete', label: 'Job Not Completed', icon: '⏰' },
];

const RESOLUTIONS = [
  {
    label: '🔄 Re-do Service (Free)',
    tone: 'primary' as const,
    disputeType: 'quality_complaint',
    note: 'Customer requests free re-do of the service.',
  },
  {
    label: '💸 Partial Refund: Rs 300',
    tone: 'warning' as const,
    disputeType: 'refund_request',
    note: 'Customer requests partial refund of Rs 300.',
  },
  {
    label: '📞 Human Agent se baat karein',
    tone: 'ghost' as const,
    disputeType: 'quality_complaint',
    note: 'Customer requests escalation to a human agent.',
  },
];

const MOCK_RESOLUTION: DisputeResolution = {
  booking_id: 'HAZ-MOCK-003',
  dispute_type: 'quality_complaint',
  dispute_id: 'DSP-MOCK-9F3A',
  dispute_status: 'resolved',
  resolution:
    'JHAGRA agent ne faisle kiya: Provider Rashid Hussain ko 2 din mein wapas bheja jaega service dobara karne ke liye — bilkul free. Provider ki profile pe warning flag lag gaya hai.',
  refund_amount: 0,
  provider_penalty: 'Warning issued — 3rd complaint in 30 days would result in suspension.',
  case_summary:
    'Customer ne incomplete electrician job report ki. Provider history check ki gayi: 1 previous complaint in 60 days. Re-service grant ki gayi.',
  escalated_to_human: false,
};

function pickBookingForDispute(
  bookings: { booking_id?: string; status?: string; created_at?: string }[],
  preferredBookingId?: string
) {
  if (preferredBookingId) {
    const match = bookings.find((b) => b.booking_id === preferredBookingId);
    if (match?.booking_id) return match;
  }
  const eligible = bookings.filter((b) => {
    const s = (b.status || '').toLowerCase();
    return b.booking_id && !['cancelled', 'refunded'].includes(s);
  });
  if (!eligible.length) return null;
  const sorted = [...eligible].sort((a, b) =>
    (b.created_at || '').localeCompare(a.created_at || '')
  );
  return sorted[0];
}

export default function DisputesScreen() {
  const router = useRouter();
  const { bookingId: routeBookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const [sel, setSel] = useState('quality');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const insets = useSafeAreaInsets();
  const [lastDisputeId, setLastDisputeId] = useState<string | null>(null);
  const [lastBookingId, setLastBookingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<DisputeResolution | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitCurrentDispute = async (choice?: (typeof RESOLUTIONS)[number]) => {
    if (!description.trim()) {
      Alert.alert('Tafseel likhein', 'Masle ki poori tafseel darj karein.');
      return;
    }

    // Mock mode: instant resolution without backend
    if (isMockMode) {
      setSubmitting(true);
      await new Promise((r) => setTimeout(r, 1200));
      setLastDisputeId(MOCK_RESOLUTION.dispute_id || null);
      setLastBookingId(MOCK_RESOLUTION.booking_id);
      setResolution(MOCK_RESOLUTION);
      setSubmitted(true);
      setSubmitting(false);
      return;
    }

    setSubmitting(true);
    try {
      const uid = await resolveUserId(user);
      if (!uid) {
        Alert.alert('Thori der intezar karein', 'Session load ho raha hai — dobara try karein.');
        return;
      }
      const bookings = await getUserBookings(uid);
      const preferredId = (routeBookingId || '').trim() || undefined;
      const target = pickBookingForDispute(bookings, preferredId);
      if (!target?.booking_id) {
        Alert.alert(
          'Pehle booking banayein',
          'Dispute file karne ke liye pehle Home se ek service book karein, phir yahan aayein.',
          [{ text: 'Home Jao', onPress: () => router.push('/') }, { text: 'Theek Hai', style: 'cancel' }]
        );
        return;
      }
      const disputeType = choice?.disputeType || sel;
      const fullDescription = [description.trim(), choice?.note].filter(Boolean).join('\n\n');
      const result = await submitDispute({
        bookingId: target.booking_id,
        userId: uid,
        disputeType,
        description: fullDescription,
      });
      setLastDisputeId(result.dispute_id || null);
      setLastBookingId(target.booking_id);
      setResolution(result);
      setSubmitted(true);
    } catch (err) {
      const msg = formatApiError(err);
      if (!isLoginRelatedError(msg)) {
        Alert.alert('Error', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && resolution) {
    const refund = resolution.refund_amount;
    const escalated = resolution.escalated_to_human;
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {isMockMode && (
          <View style={styles.mockBanner}>
            <Text style={styles.mockBannerText}>🎭 DEMO MODE — Sample resolution</Text>
          </View>
        )}
        <View style={styles.resolutionCard}>
          <Text style={styles.resolutionIcon}>{escalated ? '👨‍💼' : refund > 0 ? '💚' : 'ℹ️'}</Text>
          <Text style={styles.resolutionTitle}>JHAGRA Agent ka Faisla</Text>
          <Text style={styles.resolutionText}>{resolution.resolution}</Text>
          {refund > 0 && (
            <View style={styles.refundBadge}>
              <Text style={styles.refundText}>Refund: Rs {refund.toLocaleString()}</Text>
            </View>
          )}
          <Text style={styles.penaltyText}>Provider: {resolution.provider_penalty}</Text>
          <Text style={styles.summaryText}>{resolution.case_summary}</Text>
          {lastDisputeId ? (
            <Text style={styles.disputeRef}>
              Dispute #{lastDisputeId.slice(0, 8).toUpperCase()}
            </Text>
          ) : null}
          {escalated && (
            <Text style={styles.escalatedText}>⚠️ Human agent ko escalate kiya gaya hai</Text>
          )}
        </View>
        {lastBookingId ? (
          <TouchableOpacity
            style={[styles.trackBtn, { marginBottom: Spacing.sm }]}
            onPress={() => router.push({ pathname: '/tracking', params: { bookingId: lastBookingId } })}
          >
            <Text style={styles.trackBtnText}>Booking Tracking Dekhein</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => {
            setSel('quality');
            setDescription('');
            setLastDisputeId(null);
            setLastBookingId(null);
            setResolution(null);
            setSubmitted(false);
          }}
        >
          <Text style={styles.newBtnText}>Naya Dispute Darj Karein</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>

      {isMockMode && (
        <View style={styles.mockBanner}>
          <Text style={styles.mockBannerText}>🎭 DEMO MODE — Booking: Electrician (HAZ-MOCK-003)</Text>
        </View>
      )}

      <Text style={styles.title}>Masla Darj Karein 🚨</Text>
      <Text style={styles.sub}>Koi masla? Haazir AI aapki madad karega.</Text>

      {/* No booking warning for real mode */}
      {!isMockMode && (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            💡 Dispute submit hoga aapki latest booking ke against. Agar abhi koi booking nahi hai toh pehle Home se service book karein.
          </Text>
        </View>
      )}

      {/* Dispute Types */}
      <Text style={styles.sectionLabel}>Masle ki qisam:</Text>
      <View style={styles.typeGrid}>
        {DISPUTE_TYPES.map((t) => {
          const on = sel === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.typeCard, on && styles.typeCardActive]}
              onPress={() => setSel(t.id)}
            >
              <Text style={styles.typeIcon}>{t.icon}</Text>
              <Text style={[styles.typeLabel, on && styles.typeLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Description */}
      <Text style={styles.sectionLabel}>Kya hua? Batayein:</Text>
      <View style={[styles.textAreaCard, Shadow.card]}>
        <TextInput
          style={styles.textArea}
          placeholder={isMockMode ? 'Electrician ne kaam adhoora chor diya — wire connection nahi ki...' : 'Masle ki poori tafseelaat likhein...'}
          placeholderTextColor={Colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.evidenceBtn}>
          <Text style={styles.evidenceBtnText}>📷 Evidence Add Karein</Text>
        </TouchableOpacity>
      </View>

      {/* AI Agent Status */}
      <View style={[styles.aiCard, Shadow.card]}>
        <Text style={styles.aiTitle}>✨ JHAGRA Dispute Agent active hai</Text>
        <Text style={styles.aiText}>Provider ki history check ho rahi hai...</Text>
        <View style={styles.aiResult}>
          <Text style={styles.aiResultText}>
            {isMockMode
              ? '📊 Provider Rashid Hussain: 1 complaint in 60 days — re-service eligible'
              : '📊 Last 30 din mein provider ki history check ho rahi hai'}
          </Text>
        </View>
      </View>

      {/* Resolution Options */}
      <Text style={styles.sectionLabel}>Resolution Options:</Text>
      {submitting ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.danger} />
          <Text style={styles.loadingText}>JHAGRA agent masla dekh raha hai...</Text>
        </View>
      ) : (
        RESOLUTIONS.map((r) => (
          <TouchableOpacity
            key={r.label}
            style={[
              styles.resBtn,
              r.tone === 'primary' && styles.resBtnPrimary,
              r.tone === 'warning' && styles.resBtnWarning,
              Shadow.card,
            ]}
            onPress={() => submitCurrentDispute(r)}
          >
            <Text style={[
              styles.resBtnText,
              r.tone === 'primary' && styles.resBtnTextWhite,
              r.tone === 'warning' && styles.resBtnTextWhite,
            ]}>{r.label}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },

  mockBanner: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: Spacing.sm, alignItems: 'center', marginBottom: Spacing.md,
  },
  mockBannerText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },

  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.danger, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },

  infoCard: {
    backgroundColor: Colors.warningDim, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.warning,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  infoText: { color: Colors.warning, fontSize: FontSize.xs, lineHeight: 18 },

  sectionLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  typeCard: {
    width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md,
  },
  typeCardActive: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  typeIcon: { fontSize: 24, marginBottom: 6 },
  typeLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  typeLabelActive: { color: Colors.danger },
  textAreaCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  textArea: { color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 80 },
  evidenceBtn: { marginTop: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  evidenceBtnText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' },
  aiCard: { backgroundColor: Colors.dangerDim, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.danger + '33', padding: Spacing.md, marginBottom: Spacing.md },
  aiTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.danger, marginBottom: 4 },
  aiText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  aiResult: { backgroundColor: Colors.surface + 'AA', borderRadius: Radius.sm, padding: Spacing.sm },
  aiResultText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  resBtn: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.sm },
  resBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  resBtnWarning: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  resBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  resBtnTextWhite: { color: Colors.background },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md },
  loadingText: { color: Colors.danger, fontSize: FontSize.sm },

  resolutionCard: {
    backgroundColor: Colors.cardBg, borderRadius: Radius.xl, padding: Spacing.xl,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.primary, marginBottom: Spacing.lg,
  },
  resolutionIcon: { fontSize: 56, marginBottom: Spacing.md },
  resolutionTitle: { color: Colors.primary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.sm },
  resolutionText: { color: Colors.textPrimary, fontSize: FontSize.md, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 24 },
  refundBadge: { backgroundColor: Colors.primaryDim, borderRadius: Radius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  refundText: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '800' },
  penaltyText: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  summaryText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.sm },
  disputeRef: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.sm },
  escalatedText: { color: Colors.warning, fontSize: FontSize.sm, marginTop: Spacing.sm, fontWeight: '600' },
  trackBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center' },
  trackBtnText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '700' },
  newBtn: { borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center' },
  newBtnText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
});
