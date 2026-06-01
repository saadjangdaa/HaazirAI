import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { getChat, ChatDoc, ChatStatus } from '../services/chatService';
import { formatWorkerPrice } from '../utils/workerBookings';

const STATUS_CONFIG: Record<ChatStatus, { label: string; color: string; bg: string; icon: string }> = {
  waiting:     { label: 'Intezaar mein',    color: Colors.warning,  bg: Colors.warningDim,  icon: 'time-outline' },
  accepted:    { label: 'Accept ki gayi',   color: Colors.primary,  bg: Colors.primaryDim,  icon: 'checkmark-circle-outline' },
  on_the_way:  { label: 'Rawaana ho gaya',  color: Colors.primary,  bg: Colors.primaryDim,  icon: 'car-outline' },
  arrived:     { label: 'Pahunch gaya',     color: Colors.primary,  bg: Colors.primaryDim,  icon: 'location-outline' },
  in_progress: { label: 'Kaam chal raha',   color: Colors.workerAccent, bg: Colors.workerAccentDim, icon: 'construct-outline' },
  completed:   { label: 'Mukammal',         color: Colors.success,  bg: Colors.successDim,  icon: 'checkmark-done-circle-outline' },
  cancelled:   { label: 'Cancel',           color: Colors.danger,   bg: Colors.dangerDim,   icon: 'close-circle-outline' },
};

const DETAIL_ROWS: { key: keyof ChatDoc; label: string; icon: string }[] = [
  { key: 'service',        label: 'Service',        icon: 'construct-outline' },
  { key: 'location',       label: 'Area',           icon: 'location-outline' },
  { key: 'city',           label: 'Shehar',         icon: 'business-outline' },
  { key: 'customer_name',  label: 'Customer',       icon: 'person-outline' },
  { key: 'urgency',        label: 'Zaroorat',       icon: 'flash-outline' },
  { key: 'estimated_price',label: 'Price',          icon: 'cash-outline' },
  { key: 'created_at',     label: 'Request Time',   icon: 'time-outline' },
];

export default function JobDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { jobRequestId, bookingId, service, status, price, customerName } =
    useLocalSearchParams<{
      jobRequestId?: string;
      bookingId?: string;
      service?: string;
      status?: string;
      price?: string;
      customerName?: string;
    }>();

  const chatId = jobRequestId || bookingId;

  const [chat, setChat] = useState<ChatDoc | null>(null);
  const [loading, setLoading] = useState(!!chatId);

  useEffect(() => {
    if (!chatId) return;
    getChat(chatId).then((c) => {
      setChat(c);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [chatId]);

  const displayStatus = (chat?.status || status || 'completed') as ChatStatus;
  const cfg = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.completed;

  const displayService = chat?.service || service || 'Service';
  const displayPrice = chat?.estimated_price
    ? formatWorkerPrice(chat.estimated_price)
    : price ? `Rs ${price}` : '—';
  const displayCustomer = chat?.customer_name || customerName || 'Customer';

  function formatVal(key: keyof ChatDoc, val: any): string {
    if (key === 'estimated_price') return formatWorkerPrice(Number(val) || 0);
    if (key === 'created_at' && val) {
      try { return new Date(val).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }); }
      catch { return String(val); }
    }
    if (key === 'urgency') {
      return ({ low: 'Kam', medium: 'Darmiyani', high: 'Zyada', critical: 'Bahut Zaruri' } as any)[val] || val;
    }
    return val != null ? String(val) : '—';
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{displayService}</Text>
          <Text style={styles.headerSub}>{displayCustomer}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
          <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Summary card */}
            <View style={[styles.summaryCard, Shadow.card]}>
              <View style={styles.summaryIconWrap}>
                <Ionicons name="construct" size={28} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryService}>{displayService}</Text>
                <Text style={styles.summaryPrice}>{displayPrice}</Text>
              </View>
            </View>

            {/* Details list */}
            <View style={[styles.detailCard, Shadow.sm]}>
              <Text style={styles.detailCardTitle}>Job Details</Text>
              {chat ? (
                DETAIL_ROWS.map(({ key, label, icon }) => {
                  const val = chat[key];
                  if (val == null || val === '') return null;
                  return (
                    <View key={key} style={styles.detailRow}>
                      <View style={styles.detailIconWrap}>
                        <Ionicons name={icon as any} size={15} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailLabel}>{label}</Text>
                        <Text style={styles.detailValue}>{formatVal(key, val)}</Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <>
                  {[
                    { label: 'Service', val: displayService, icon: 'construct-outline' },
                    { label: 'Customer', val: displayCustomer, icon: 'person-outline' },
                    { label: 'Price', val: displayPrice, icon: 'cash-outline' },
                    { label: 'Status', val: cfg.label, icon: cfg.icon },
                  ].map(({ label, val, icon }) => (
                    <View key={label} style={styles.detailRow}>
                      <View style={styles.detailIconWrap}>
                        <Ionicons name={icon as any} size={15} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailLabel}>{label}</Text>
                        <Text style={styles.detailValue}>{val}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>

            {/* Messages summary */}
            {chat?.messages && chat.messages.length > 0 && (
              <View style={[styles.detailCard, Shadow.sm]}>
                <Text style={styles.detailCardTitle}>Chat Summary</Text>
                <Text style={styles.chatSummary}>
                  {chat.messages.length} messages · last activity{' '}
                  {chat.updated_at
                    ? new Date(chat.updated_at).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' })
                    : '—'}
                </Text>
              </View>
            )}

            {/* Open Chat button */}
            {chatId && (
              <TouchableOpacity
                style={[styles.chatBtn, Shadow.primary]}
                onPress={() =>
                  router.push({
                    pathname: '/worker-chat',
                    params: {
                      jobRequestId: chatId,
                      customerName: displayCustomer,
                      service: displayService,
                    },
                  })
                }
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
                <Text style={styles.chatBtnText}>Chat Kholein</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5,
  },
  statusPillText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  body: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.sm },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  summaryIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  summaryService: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  summaryPrice: { fontSize: FontSize.md, fontWeight: FontWeight.black, color: Colors.primary, marginTop: 3 },

  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  detailCardTitle: {
    fontSize: FontSize.xs, fontWeight: FontWeight.bold,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  detailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 2 },
  detailValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },

  chatSummary: { fontSize: FontSize.sm, color: Colors.textSecondary },

  chatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  chatBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },
});
