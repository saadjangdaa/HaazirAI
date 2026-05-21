import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, RefreshControl, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useMockData } from '../../context/MockDataContext';
import {
  DisputeRecord, formatApiError, getWorkerDisputes, requireUserId, respondToDispute,
} from '../../services/api';

const MOCK_DISPUTES: DisputeRecord[] = [
  {
    dispute_id: 'DSP-MOCK-W1',
    booking_id: 'HAZ-MOCK-003',
    type: 'quality_complaint',
    status: 'open',
    customer_message: 'Kaam theek nahi hua, wire abhi bhi loose hai.',
    created_at: new Date().toISOString(),
  },
];

const TYPE_LABEL: Record<string, string> = {
  no_show: 'No-show',
  quality_complaint: 'Quality',
  price_disagreement: 'Price',
  rude_behavior: 'Behavior',
  overrun: 'Time overrun',
  cancellation: 'Cancellation',
  refund_request: 'Refund',
};

export default function WorkerDisputesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isMockMode) {
      setDisputes(MOCK_DISPUTES);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!user?.id) {
      setDisputes([]);
      setLoading(false);
      return;
    }
    try {
      const uid = requireUserId(user);
      const res = await getWorkerDisputes(uid, 'open');
      setDisputes(res.disputes || []);
    } catch (e) {
      setDisputes([]);
      Alert.alert('Disputes load nahi hue', formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, isMockMode]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const handleRespond = async (d: DisputeRecord) => {
    const id = d.dispute_id;
    const msg = (replyText[id] || '').trim();
    if (msg.length < 10) {
      Alert.alert('Zaroori', 'Jawab kam az kam 10 characters ka ho.');
      return;
    }
    if (isMockMode) {
      setDisputes((prev) =>
        prev.map((x) =>
          x.dispute_id === id
            ? {
                ...x,
                status: 'under_review',
                worker_response: { message: msg, timestamp: new Date().toISOString() },
              }
            : x
        )
      );
      setExpandedId(null);
      Alert.alert('Shukriya', 'Demo: jawab record ho gaya (under review).');
      return;
    }
    if (!user?.id) return;
    setSubmittingId(id);
    try {
      const uid = requireUserId(user);
      const result = await respondToDispute({ disputeId: id, userId: uid, message: msg });
      const warn = result.worker_warning;
      Alert.alert(
        'Jawab bhej diya',
        warn
          ? `${warn}\n\nCase ab review mein hai.`
          : 'Customer ko update milega. Case ab review mein hai.',
      );
      setReplyText((prev) => ({ ...prev, [id]: '' }));
      setExpandedId(null);
      await load();
    } catch (e) {
      Alert.alert('Error', formatApiError(e));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Customer Complaints</Text>
          <Text style={styles.headerSub}>Sirf open disputes — jawab dein</Text>
        </View>
      </View>

      {loading && disputes.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
          }
        >
          {disputes.length === 0 ? (
            <View style={[styles.emptyCard, Shadow.card]}>
              <Text style={styles.emptyIcon}>✓</Text>
              <Text style={styles.emptyTitle}>Koi open complaint nahi</Text>
              <Text style={styles.emptyText}>Jab customer dispute karega, yahan dikhega.</Text>
            </View>
          ) : (
            disputes.map((d) => {
              const open = d.status === 'open';
              const expanded = expandedId === d.dispute_id;
              const label = TYPE_LABEL[d.type] || d.type;
              return (
                <View key={d.dispute_id} style={[styles.card, Shadow.card]}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setExpandedId(expanded ? null : d.dispute_id)}
                  >
                    <View style={styles.cardTop}>
                      <View style={[styles.badge, open ? styles.badgeOpen : styles.badgeReview]}>
                        <Text style={styles.badgeText}>{open ? 'OPEN' : d.status.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.typeText}>{label}</Text>
                    </View>
                    <Text style={styles.bookingRef}>#{d.booking_id}</Text>
                    <Text style={styles.complaintLabel}>Customer:</Text>
                    <Text style={styles.complaintText} numberOfLines={expanded ? undefined : 3}>
                      {d.customer_message || d.description || '—'}
                    </Text>
                  </TouchableOpacity>

                  {expanded && open && (
                    <View style={styles.replyBox}>
                      <Text style={styles.replyLabel}>Apna jawab likhein:</Text>
                      <TextInput
                        style={styles.replyInput}
                        value={replyText[d.dispute_id] || ''}
                        onChangeText={(t) => setReplyText((prev) => ({ ...prev, [d.dispute_id]: t }))}
                        placeholder="Apni side batayein — booking change nahi hogi"
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                      />
                      <TouchableOpacity
                        style={[styles.sendBtn, submittingId === d.dispute_id && styles.sendBtnBusy]}
                        onPress={() => handleRespond(d)}
                        disabled={submittingId === d.dispute_id}
                      >
                        {submittingId === d.dispute_id ? (
                          <ActivityIndicator color={Colors.textInverse} size="small" />
                        ) : (
                          <Text style={styles.sendBtnText}>Jawab Bhejein</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {d.worker_response?.message ? (
                    <View style={styles.sentBox}>
                      <Text style={styles.sentLabel}>Aapka jawab:</Text>
                      <Text style={styles.sentText}>{d.worker_response.message}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    backgroundColor: Colors.primary,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.md, gap: Spacing.md },
  emptyCard: {
    backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center',
  },
  emptyIcon: { fontSize: 36, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm },
  badgeOpen: { backgroundColor: Colors.dangerDim },
  badgeReview: { backgroundColor: Colors.primaryDim },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.danger },
  typeText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  bookingRef: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  complaintLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  complaintText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  replyBox: { marginTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, paddingTop: Spacing.md },
  replyLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  replyInput: {
    backgroundColor: Colors.background, borderRadius: Radius.md, padding: Spacing.sm,
    minHeight: 88, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: {
    marginTop: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  sendBtnBusy: { opacity: 0.7 },
  sendBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  sentBox: { marginTop: Spacing.sm, padding: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md },
  sentLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  sentText: { fontSize: FontSize.sm, color: Colors.textPrimary, marginTop: 4 },
});
