import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import {
  submitDispute,
  getDisputeEligibility,
  DisputeResolution,
  formatApiError,
  isLoginRelatedError,
  resolveUserId,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useMockData } from '../context/MockDataContext';
import { isDisputeAwaitingResolution } from '../utils/disputeStatus';

const DISPUTE_TYPES = [
  { id: 'no_show', label: 'Provider Nahi Aaya', icon: '🚫' },
  { id: 'quality_complaint', label: 'Kaam Acha Nahi Tha', icon: '👎' },
  { id: 'price_disagreement', label: 'Zyada Charge Kiya', icon: '💰' },
  { id: 'rude_behavior', label: 'Rude Behavior', icon: '😠' },
  { id: 'overrun', label: 'Time Zyada Laga', icon: '⏱' },
  { id: 'cancellation', label: 'Cancellation', icon: '❌' },
  { id: 'refund_request', label: 'Refund Chahiye', icon: '💸' },
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

export default function DisputeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const { bookingId: rawBookingId } = useLocalSearchParams<{ bookingId: string }>();
  const bookingId = isMockMode ? 'HAZ-MOCK-003' : rawBookingId;
  const [disputeType, setDisputeType] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState<DisputeResolution | null>(null);
  const [eligibilityBlocked, setEligibilityBlocked] = useState<string | null>(null);

  useEffect(() => {
    if (isMockMode) {
      setEligibilityBlocked(null);
      return;
    }
    const bid = (rawBookingId || '').trim();
    if (!bid) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await getDisputeEligibility(bid);
        if (cancelled) return;
        if (!row.eligible) {
          setEligibilityBlocked(row.message);
        } else {
          setEligibilityBlocked(null);
        }
      } catch {
        if (!cancelled) setEligibilityBlocked(null);
      }
    })();
    return () => { cancelled = true; };
  }, [rawBookingId, isMockMode]);

  const handleSubmit = async () => {
    if (eligibilityBlocked) {
      Alert.alert('Abhi dispute nahi ho sakta', eligibilityBlocked);
      return;
    }
    if (!disputeType) { Alert.alert('Complaint ka type chunein'); return; }
    if (!description.trim()) { Alert.alert('Thoda detail mein batayein'); return; }

    if (isMockMode) {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 1200));
      setResolution(MOCK_RESOLUTION);
      setLoading(false);
      return;
    }

    const bid = (bookingId || '').trim();
    if (!bid) {
      Alert.alert(
        'Booking ID missing',
        'Tracking screen se dobara try karein, ya Bookings tab se kisi active booking ko open karein.',
        [{ text: 'Bookings Dekhein', onPress: () => router.push('/(customer)/bookings') }, { text: 'OK', style: 'cancel' }]
      );
      return;
    }
    setLoading(true);
    try {
      const uid = await resolveUserId(user);
      if (!uid) {
        Alert.alert('Thori der intezar karein', 'Session load ho raha hai — dobara try karein.');
        return;
      }
      if (!isMockMode) {
        const check = await getDisputeEligibility(bid);
        if (!check.eligible) {
          setEligibilityBlocked(check.message);
          Alert.alert('Abhi dispute nahi ho sakta', check.message);
          return;
        }
      }
      const result = await submitDispute({
        bookingId: bid,
        userId: uid,
        disputeType,
        description,
      });
      setResolution(result);
    } catch (err: unknown) {
      const msg = formatApiError(err);
      if (!isLoginRelatedError(msg)) {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (resolution) {
    if (isDisputeAwaitingResolution(resolution)) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={styles.resolutionCard}>
            <Text style={styles.resolutionIcon}>📋</Text>
            <Text style={styles.resolutionTitle}>Shikayat Darj Ho Gayi</Text>
            <Text style={styles.resolutionText}>
              {resolution.message || resolution.case_summary}
            </Text>
            {resolution.dispute_id ? (
              <Text style={styles.summaryText}>ID: {resolution.dispute_id}</Text>
            ) : null}
            <Text style={styles.pendingHint}>
              Worker ko jawab dene ka moqa milega. Review ke baad aapko update milega.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() =>
              router.replace({ pathname: '/(customer)/disputes', params: {} })
            }
          >
            <Text style={styles.homeBtnText}>Meri Disputes</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    const refund = resolution.refund_amount;
    const escalated = resolution.escalated_to_human;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
          {escalated && (
            <Text style={styles.escalatedText}>⚠️ Human agent ko escalate kiya gaya hai</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() =>
            router.replace({ pathname: '/tracking', params: { bookingId: bookingId || '' } })
          }
        >
          <Text style={styles.homeBtnText}>Tracking Dekhein</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Complaint / Dispute</Text>
      <Text style={styles.sub}>Shikayat darj hogi — worker jawab de sakta hai, phir review</Text>
      <Text style={styles.bookingRef}>Booking: {bookingId || '—'}</Text>
      {eligibilityBlocked ? (
        <Text style={styles.eligibilityWarn}>{eligibilityBlocked}</Text>
      ) : null}

      <Text style={styles.sectionLabel}>Masla Kya Hai?</Text>
      <View style={styles.typeGrid}>
        {DISPUTE_TYPES.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.typeBtn, disputeType === t.id && styles.typeBtnActive]}
            onPress={() => setDisputeType(t.id)}
          >
            <Text style={styles.typeIcon}>{t.icon}</Text>
            <Text style={[styles.typeLabel, disputeType === t.id && styles.typeLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Tafseel Likhen:</Text>
      <TextInput
        style={styles.descInput}
        value={description}
        onChangeText={setDescription}
        placeholder="Kya hua? Poori baat batayein — JHAGRA agent aapki baat sunega"
        placeholderTextColor={Colors.textMuted}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      <TouchableOpacity style={styles.photoBtn} onPress={() => Alert.alert('Evidence', 'Photo upload — coming soon')}>
        <Text style={styles.photoBtnText}>📷 Evidence / Photo Lagayein</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Shikayat submit ho rahi hai...</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!disputeType || eligibilityBlocked) && styles.submitBtnDisabled,
            Shadow.primary,
          ]}
          disabled={!!eligibilityBlocked}
          onPress={handleSubmit}
        >
          <Text style={styles.submitBtnText}>⚖️ Dispute Submit Karo</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800', marginBottom: 4 },
  sub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: 4 },
  bookingRef: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: Spacing.lg },
  eligibilityWarn: {
    color: Colors.danger, fontSize: FontSize.sm, marginBottom: Spacing.md,
    backgroundColor: Colors.dangerDim, padding: Spacing.sm, borderRadius: Radius.md,
  },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm, marginTop: Spacing.sm },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  typeBtn: { width: '47%', backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  typeBtnActive: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  typeIcon: { fontSize: 24, marginBottom: 4 },
  typeLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center' },
  typeLabelActive: { color: Colors.danger },
  descInput: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 120, marginBottom: Spacing.md },
  photoBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  photoBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md, gap: Spacing.sm },
  loadingText: { color: Colors.primary, fontSize: FontSize.sm },
  submitBtn: { backgroundColor: Colors.danger, borderRadius: Radius.lg, padding: Spacing.md + 2, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
  resolutionCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary, marginBottom: Spacing.lg },
  resolutionIcon: { fontSize: 56, marginBottom: Spacing.md },
  resolutionTitle: { color: Colors.primary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.sm },
  resolutionText: { color: Colors.textPrimary, fontSize: FontSize.md, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 24 },
  refundBadge: { backgroundColor: Colors.primaryDim, borderRadius: Radius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  refundText: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '800' },
  penaltyText: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  summaryText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.sm },
  pendingHint: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.md, lineHeight: 20 },
  escalatedText: { color: Colors.warning, fontSize: FontSize.sm, marginTop: Spacing.sm, fontWeight: '600' },
  homeBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center' },
  homeBtnText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '700' },
});
