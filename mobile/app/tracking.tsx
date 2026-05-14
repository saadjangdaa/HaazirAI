import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { getBookingStatus, BookingStatus } from '../services/api';

const STEPS = [
  { key: 'Booked', icon: '📝', label: 'Booking Ho Gayi' },
  { key: 'Confirmed', icon: '✅', label: 'Provider Ne Confirm Kiya' },
  { key: 'En Route', icon: '🛵', label: 'Provider Aa Raha Hai' },
  { key: 'Arrived', icon: '📍', label: 'Provider Pohonch Gaya' },
  { key: 'In Progress', icon: '🔧', label: 'Kaam Chal Raha Hai' },
  { key: 'Completed', icon: '🎉', label: 'Kaam Mukammal!' },
];

export default function TrackingScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [simStep, setSimStep] = useState(1);

  useEffect(() => {
    if (bookingId) {
      getBookingStatus(bookingId).then(setStatus).catch(console.error);
    }
  }, [bookingId]);

  const currentStep = simStep;

  const handleSimulate = () => {
    if (simStep < STEPS.length - 1) setSimStep((s) => s + 1);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.bookingId}>Ref: {bookingId || 'HAZ-DEMO-001'}</Text>

      <View style={styles.timeline}>
        {STEPS.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <View key={step.key} style={styles.timelineRow}>
              <View style={styles.timelineLeft}>
                <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                  <Text style={styles.dotIcon}>{done ? '✓' : step.icon}</Text>
                </View>
                {i < STEPS.length - 1 && (
                  <View style={[styles.line, done && styles.lineDone]} />
                )}
              </View>
              <View style={styles.timelineRight}>
                <Text style={[styles.stepLabel, done && styles.stepLabelDone, active && styles.stepLabelActive]}>
                  {step.label}
                </Text>
                {active && <Text style={styles.stepActive}>← Abhi yahan hai</Text>}
              </View>
            </View>
          );
        })}
      </View>

      {/* Provider Card */}
      <View style={styles.providerCard}>
        <Text style={styles.providerTitle}>Provider Info</Text>
        <View style={styles.providerRow}>
          <Text style={styles.providerInfo}>👤 Ali AC Services</Text>
          <Text style={styles.providerInfo}>⭐ 4.8</Text>
        </View>
        <TouchableOpacity style={styles.callBtn} onPress={() => Alert.alert('Call', '03001234567 — Demo mode')}>
          <Text style={styles.callBtnText}>📞 Provider Ko Call Karein</Text>
        </TouchableOpacity>
      </View>

      {/* Simulate Progress */}
      {simStep < STEPS.length - 1 && (
        <TouchableOpacity style={styles.simulateBtn} onPress={handleSimulate}>
          <Text style={styles.simulateBtnText}>▶ Next Step Simulate Karo (Demo)</Text>
        </TouchableOpacity>
      )}

      {simStep === STEPS.length - 1 && (
        <TouchableOpacity
          style={[styles.feedbackBtn, Shadow.primary]}
          onPress={() => router.push({ pathname: '/feedback', params: { bookingId: bookingId || 'HAZ-DEMO-001' } })}
        >
          <Text style={styles.feedbackBtnText}>⭐ Feedback Dein</Text>
        </TouchableOpacity>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => Alert.alert('Reschedule', 'Reschedule flow — coming soon')}>
          <Text style={styles.actionBtnText}>🔄 Reschedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.disputeBtn]}
          onPress={() => router.push({ pathname: '/dispute', params: { bookingId: bookingId || 'HAZ-DEMO-001' } })}
        >
          <Text style={[styles.actionBtnText, { color: Colors.danger }]}>⚠️ Complaint</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  bookingId: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginBottom: Spacing.lg },
  timeline: { marginBottom: Spacing.lg },
  timelineRow: { flexDirection: 'row', minHeight: 60 },
  timelineLeft: { alignItems: 'center', width: 40 },
  dot: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceElevated, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  dotDone: { backgroundColor: Colors.primaryDim, borderColor: Colors.primary },
  dotActive: { backgroundColor: Colors.warningDim, borderColor: Colors.warning },
  dotIcon: { fontSize: 14 },
  line: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 2 },
  lineDone: { backgroundColor: Colors.primary },
  timelineRight: { flex: 1, paddingLeft: Spacing.md, paddingBottom: Spacing.md, justifyContent: 'center' },
  stepLabel: { color: Colors.textMuted, fontSize: FontSize.md },
  stepLabelDone: { color: Colors.primary, fontWeight: '600' },
  stepLabelActive: { color: Colors.warning, fontWeight: '700', fontSize: FontSize.lg },
  stepActive: { color: Colors.warning, fontSize: FontSize.xs, marginTop: 2 },
  providerCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  providerTitle: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm },
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  providerInfo: { color: Colors.textPrimary, fontSize: FontSize.md },
  callBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary },
  callBtnText: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.sm },
  simulateBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  simulateBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  feedbackBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  feedbackBtnText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  disputeBtn: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  actionBtnText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
});
