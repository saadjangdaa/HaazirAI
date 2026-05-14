import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { submitDispute, DisputeResolution } from '../services/api';

const DISPUTE_TYPES = [
  { id: 'no_show', label: 'Provider Nahi Aaya', icon: '🚫' },
  { id: 'quality_complaint', label: 'Kaam Acha Nahi Tha', icon: '👎' },
  { id: 'price_disagreement', label: 'Zyada Charge Kiya', icon: '💰' },
  { id: 'overrun', label: 'Time Zyada Laga', icon: '⏱' },
  { id: 'cancellation', label: 'Cancellation', icon: '❌' },
  { id: 'refund_request', label: 'Refund Chahiye', icon: '💸' },
];

export default function DisputeScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [disputeType, setDisputeType] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState<DisputeResolution | null>(null);

  const handleSubmit = async () => {
    if (!disputeType) { Alert.alert('Complaint ka type chunein'); return; }
    if (!description.trim()) { Alert.alert('Thoda detail mein batayein'); return; }
    setLoading(true);
    try {
      const result = await submitDispute({
        bookingId: bookingId || 'HAZ-DEMO-001',
        disputeType,
        description,
      });
      setResolution(result);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Dispute submit nahi hua');
    }
    setLoading(false);
  };

  if (resolution) {
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
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.push('/')}>
          <Text style={styles.homeBtnText}>Wapas Jao</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Complaint / Dispute</Text>
      <Text style={styles.sub}>JHAGRA Agent aapka masla solve karega</Text>
      <Text style={styles.bookingRef}>Booking: {bookingId || 'HAZ-DEMO-001'}</Text>

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
        placeholder="Kya hua? Poori baat batayein — JHAGRA agent aapki baat sunegaTafseel Likhen:"
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
          <Text style={styles.loadingText}>JHAGRA agent masla solve kar raha hai...</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.submitBtn, !disputeType && styles.submitBtnDisabled, Shadow.primary]}
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
  escalatedText: { color: Colors.warning, fontSize: FontSize.sm, marginTop: Spacing.sm, fontWeight: '600' },
  homeBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center' },
  homeBtnText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '700' },
});
