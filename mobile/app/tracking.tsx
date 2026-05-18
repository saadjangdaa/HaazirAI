import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import {
  getBookingStatus, updateBookingStatus, formatApiError, BookingStatus,
} from '../services/api';

const DEMO_ADVANCE = ['confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed'];

export default function TrackingScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const data = await getBookingStatus(bookingId);
      setStatus(data);
    } catch (e) {
      Alert.alert('Error', formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdvance = async () => {
    if (!bookingId || !status) return;
    const current = status.status?.toLowerCase() || 'assigned';
    const idx = DEMO_ADVANCE.indexOf(current);
    const next = idx >= 0 && idx < DEMO_ADVANCE.length - 1
      ? DEMO_ADVANCE[idx + 1]
      : current === 'assigned'
        ? 'confirmed'
        : 'completed';
    if (next === current) return;
    setAdvancing(true);
    try {
      const updated = await updateBookingStatus(bookingId, next);
      setStatus(updated);
    } catch (e) {
      Alert.alert('Error', formatApiError(e));
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const steps = status?.tracking_steps || [];
  const completed = status?.status === 'completed';

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.bookingId}>Ref: {bookingId}</Text>
      <Text style={styles.statusLine}>Status: {status?.status?.replace(/_/g, ' ') || '—'}</Text>

      <View style={styles.timeline}>
        {steps.map((step, i) => (
          <View key={`${step.key || step.step}-${i}`} style={styles.timelineRow}>
            <View style={styles.timelineLeft}>
              <View style={[styles.dot, step.done && styles.dotDone]}>
                <Text style={styles.dotIcon}>{step.done ? '✓' : '○'}</Text>
              </View>
              {i < steps.length - 1 && (
                <View style={[styles.line, step.done && styles.lineDone]} />
              )}
            </View>
            <Text style={[styles.stepLabel, step.done && styles.stepLabelDone]}>{step.step}</Text>
          </View>
        ))}
      </View>

      {status?.provider_name && (
        <View style={styles.providerCard}>
          <Text style={styles.providerTitle}>Provider</Text>
          <Text style={styles.providerInfo}>{status.provider_name}</Text>
          <Text style={styles.providerInfo}>{status.service}</Text>
        </View>
      )}

      {!completed && (
        <TouchableOpacity
          style={styles.simulateBtn}
          onPress={handleAdvance}
          disabled={advancing}
        >
          <Text style={styles.simulateBtnText}>
            {advancing ? 'Updating...' : '▶ Advance status (demo)'}
          </Text>
        </TouchableOpacity>
      )}

      {completed && (
        <TouchableOpacity
          style={[styles.feedbackBtn, Shadow.primary]}
          onPress={() => router.push({ pathname: '/feedback', params: { bookingId } })}
        >
          <Text style={styles.feedbackBtnText}>Feedback dein</Text>
        </TouchableOpacity>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.disputeBtn]}
          onPress={() => router.push({ pathname: '/dispute', params: { bookingId } })}
        >
          <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Complaint</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bookingId: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginBottom: 4 },
  statusLine: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.lg },
  timeline: { marginBottom: Spacing.lg },
  timelineRow: { flexDirection: 'row', minHeight: 48 },
  timelineLeft: { alignItems: 'center', width: 40 },
  dot: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceElevated, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  dotDone: { backgroundColor: Colors.primaryDim, borderColor: Colors.primary },
  dotIcon: { fontSize: 12, color: Colors.textPrimary },
  line: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 2 },
  lineDone: { backgroundColor: Colors.primary },
  stepLabel: { flex: 1, color: Colors.textMuted, fontSize: FontSize.sm, paddingLeft: Spacing.md, paddingTop: 6 },
  stepLabelDone: { color: Colors.primary, fontWeight: '600' },
  providerCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  providerTitle: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm },
  providerInfo: { color: Colors.textPrimary, fontSize: FontSize.md },
  simulateBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary },
  simulateBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '700' },
  feedbackBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  feedbackBtnText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  disputeBtn: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  actionBtnText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
});
