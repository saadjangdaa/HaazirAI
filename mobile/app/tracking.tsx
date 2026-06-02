import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import {
  getBookingStatus, getDisputeEligibility, updateBookingStatus, formatApiError, BookingStatus,
} from '../services/api';
import { isDisputeEligibleStatus } from '../utils/disputeEligibility';
import { subscribeToChat, ChatDoc } from '../services/chatService';

const DEMO_ADVANCE = ['confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed'];

const STATUS_ICONS: Record<string, string> = {
  confirmed: 'checkmark-circle',
  on_the_way: 'navigate',
  arrived: 'location',
  in_progress: 'construct',
  completed: 'trophy',
};

export default function TrackingScreen() {
  const router = useRouter();
  const { bookingId, jobRequestId } = useLocalSearchParams<{ bookingId: string; jobRequestId?: string }>();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [canFileDispute, setCanFileDispute] = useState(false);
  const [chat, setChat] = useState<ChatDoc | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!bookingId) return;
    if (!silent) setLoading(true);
    try {
      const data = await getBookingStatus(bookingId);
      setStatus(data);
    } catch (e) {
      if (!silent) Alert.alert('Error', formatApiError(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [bookingId]);

  // Initial load + polling every 10s
  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  // Real-time Firestore chat listener (updates status without polling delay)
  useEffect(() => {
    const chatId = jobRequestId || bookingId;
    if (!chatId) return;
    const unsub = subscribeToChat(chatId, (doc) => {
      if (!doc) return;
      setChat(doc);
      // Map chat status to booking tracking steps
      const chatToBooking: Partial<Record<string, string>> = {
        on_the_way: 'on_the_way', arrived: 'arrived',
        in_progress: 'in_progress', completed: 'completed',
      };
      const mapped = chatToBooking[doc.status];
      if (mapped && status) {
        setStatus((prev) => prev ? { ...prev, status: mapped } : prev);
      }
    });
    return unsub;
  }, [jobRequestId, bookingId]);

  useEffect(() => {
    if (!bookingId || !status?.status) {
      setCanFileDispute(false);
      return;
    }
    const s = status.status.toLowerCase();
    if (isDisputeEligibleStatus(s)) {
      setCanFileDispute(true);
      return;
    }
    if (s === 'confirmed') {
      getDisputeEligibility(bookingId)
        .then((r) => setCanFileDispute(r.eligible))
        .catch(() => setCanFileDispute(false));
      return;
    }
    setCanFileDispute(false);
  }, [bookingId, status?.status]);

  const handleAdvance = async () => {
    if (!bookingId || !status) return;
    const current = status.status?.toLowerCase() || 'assigned';
    const idx = DEMO_ADVANCE.indexOf(current);
    const next = idx >= 0 && idx < DEMO_ADVANCE.length - 1 ? DEMO_ADVANCE[idx + 1] : current === 'assigned' ? 'confirmed' : 'completed';
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
        <Text style={styles.loadingText}>Tracking info load ho rahi hai...</Text>
      </View>
    );
  }

  const steps = status?.tracking_steps || [];
  const completed = status?.status === 'completed';
  const currentStatus = status?.status?.toLowerCase() || '';
  const isRebooking = currentStatus === 'cancelled' || currentStatus === 'rebooking';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Live Tracking</Text>
          <Text style={styles.headerSub}>Ref: {bookingId}</Text>
        </View>
        <View style={[styles.statusPill, completed && styles.statusPillDone]}>
          <Text style={[styles.statusPillText, completed && styles.statusPillTextDone]}>
            {status?.status?.replace(/_/g, ' ') || '—'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Case 3: Rebooking / cancellation recovery banner */}
        {isRebooking && (
          <View style={styles.rebookingBanner}>
            <ActivityIndicator size="small" color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rebookingTitle}>Provider ne cancel kar diya</Text>
              <Text style={styles.rebookingText}>
                Haazir AI aap ke liye naya worker dhundh raha hai...
              </Text>
            </View>
          </View>
        )}

        {/* Provider info */}
        {!isRebooking && status?.provider_name && (
          <View style={[styles.providerCard, Shadow.sm]}>
            <View style={styles.providerAvatar}>
              <Ionicons name="person" size={26} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{status.provider_name}</Text>
              <Text style={styles.providerService}>{status.service}</Text>
            </View>
            <View style={styles.providerActions}>
              <TouchableOpacity style={styles.actionCircle} onPress={() => {}}>
                <Ionicons name="call-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCircle}
                onPress={() => {
                  const chatId = jobRequestId || bookingId;
                  if (chatId) {
                    router.push({
                      pathname: '/job-chat',
                      params: {
                        jobRequestId: chatId,
                        workerName: status?.provider_name || '',
                        service: status?.service || '',
                      },
                    });
                  }
                }}
              >
                <Ionicons name="chatbubble-outline" size={18} color={Colors.primary} />
                {chat && chat.status !== 'waiting' && (
                  <View style={styles.chatDot} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Timeline */}
        <View style={[styles.timelineCard, Shadow.sm]}>
          <Text style={styles.timelineTitle}>Service Status</Text>
          {steps.map((step, i) => {
            const iconName = (STATUS_ICONS[step.key || ''] || 'ellipse-outline') as any;
            return (
              <View key={`${step.key || step.step}-${i}`} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.dot, step.done && styles.dotDone]}>
                    {step.done
                      ? <Ionicons name="checkmark" size={14} color={Colors.textInverse} />
                      : <View style={styles.dotInner} />
                    }
                  </View>
                  {i < steps.length - 1 && <View style={[styles.line, step.done && styles.lineDone]} />}
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepLabel, step.done && styles.stepLabelDone]}>{step.step}</Text>
                  {step.done && <Text style={styles.stepTime}>Completed</Text>}
                </View>
              </View>
            );
          })}
        </View>

        {/* Demo advance button */}
        {!completed && (
          <TouchableOpacity style={[styles.simulateBtn, Shadow.sm]} onPress={handleAdvance} disabled={advancing} activeOpacity={0.8}>
            {advancing
              ? <ActivityIndicator color={Colors.primary} size="small" />
              : <Ionicons name="play-circle-outline" size={18} color={Colors.primary} />
            }
            <Text style={styles.simulateBtnText}>{advancing ? 'Updating...' : 'Advance Status (Demo)'}</Text>
          </TouchableOpacity>
        )}

        {/* Feedback */}
        {completed && (
          <TouchableOpacity
            style={[styles.feedbackBtn, Shadow.primary]}
            onPress={() => router.push({ pathname: '/feedback', params: { bookingId } })}
            activeOpacity={0.85}
          >
            <Ionicons name="star-outline" size={18} color={Colors.textInverse} />
            <Text style={styles.feedbackBtnText}>Rating aur Feedback Dein</Text>
          </TouchableOpacity>
        )}

        {canFileDispute && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.disputeBtn}
              onPress={() => router.push({ pathname: '/dispute', params: { bookingId } })}
              activeOpacity={0.8}
            >
              <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
              <Text style={styles.disputeBtnText}>Complaint</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

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
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)' },
  statusPill: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusPillDone: { backgroundColor: Colors.success },
  statusPillText: { fontSize: FontSize.xs, color: Colors.textInverse, fontWeight: FontWeight.bold, textTransform: 'capitalize' },
  statusPillTextDone: { color: Colors.textInverse },

  body: { flex: 1 },
  content: { padding: Spacing.md },

  // Provider card
  providerCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  providerAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  providerName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 2 },
  providerService: { fontSize: FontSize.xs, color: Colors.textMuted },
  providerActions: { flexDirection: 'row', gap: Spacing.sm },
  actionCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  chatDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, borderWidth: 1.5, borderColor: '#fff' },

  // Timeline
  timelineCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  timelineTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.md },
  timelineRow: { flexDirection: 'row', minHeight: 52 },
  timelineLeft: { alignItems: 'center', width: 36 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  dotDone: { backgroundColor: Colors.primary },
  dotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.borderStrong },
  line: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 2 },
  lineDone: { backgroundColor: Colors.primary },
  stepContent: { flex: 1, paddingLeft: Spacing.sm, paddingTop: 4 },
  stepLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  stepLabelDone: { color: Colors.textPrimary, fontWeight: FontWeight.bold },
  stepTime: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 2 },

  rebookingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.warningDim, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.warning,
  },
  rebookingTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.warning, marginBottom: 2 },
  rebookingText: { fontSize: FontSize.sm, color: Colors.textSecondary },

  simulateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.primaryDim,
  },
  simulateBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  feedbackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    height: 56, marginBottom: Spacing.md,
  },
  feedbackBtnText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  actionRow: { flexDirection: 'row' },
  disputeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dangerDim, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.danger,
  },
  disputeBtnText: { color: Colors.danger, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
