import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';

const BOOKINGS = [
  {
    svc: 'AC Repair',
    who: 'Ali AC Tech',
    when: '15 May, 10:00 AM',
    status: 'En Route',
    statusColor: Colors.primary,
    statusBg: Colors.surfaceElevated,
    price: 'Rs 900',
    bookingId: 'HAZ-2024-0042',
    active: true,
  },
  {
    svc: 'Plumber',
    who: 'Tariq Plumbing',
    when: '12 May, 3:00 PM',
    status: 'Completed ✅',
    statusColor: Colors.textMuted,
    statusBg: Colors.border,
    price: 'Rs 600',
    bookingId: 'HAZ-2024-0038',
    active: false,
  },
  {
    svc: 'Electrician',
    who: 'City Fix',
    when: '5 May, 11:00 AM',
    status: 'Completed ✅',
    statusColor: Colors.textMuted,
    statusBg: Colors.border,
    price: 'Rs 1,200',
    bookingId: 'HAZ-2024-0031',
    active: false,
  },
];

export default function BookingsScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Meri Bookings</Text>

      {/* Summary strip */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: Colors.primary }]}>12</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: Colors.warning }]}>1</Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>Rs 14k</Text>
          <Text style={styles.summaryLabel}>Spent</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: Colors.primary }]}>Rs 350</Text>
          <Text style={styles.summaryLabel}>Saved</Text>
        </View>
      </View>

      {/* Booking cards */}
      {BOOKINGS.map((b, i) => (
        <View key={i} style={[styles.card, b.active && styles.cardActive, Shadow.card]}>
          {b.active && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeBadgeText}>Live</Text>
            </View>
          )}
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardSvc}>{b.svc}</Text>
              <Text style={styles.cardWho}>{b.who} · {b.when}</Text>
              <Text style={styles.cardId}>#{b.bookingId}</Text>
            </View>
            <View style={styles.cardRight}>
              <View style={[styles.statusBadge, { backgroundColor: b.statusBg }]}>
                <Text style={[styles.statusText, { color: b.statusColor }]}>{b.status}</Text>
              </View>
              <Text style={styles.cardPrice}>{b.price}</Text>
            </View>
          </View>
          {b.active && (
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={() => router.push({ pathname: '/tracking', params: { bookingId: b.bookingId } })}
            >
              <Text style={styles.trackBtnText}>🛵 Track Live →</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Empty state tip */}
      <View style={styles.tipCard}>
        <Text style={styles.tipText}>
          💡 Haazir AI aapke saare bookings track karta hai — cancellation pe automatically naya provider dhundh leta hai.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: Radius.xl, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md, position: 'relative',
  },
  cardActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceElevated },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  activeBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardSvc: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  cardWho: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  cardId: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, fontFamily: 'monospace' },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  cardPrice: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  trackBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  trackBtnText: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '800' },
  tipCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryDim, padding: Spacing.md },
  tipText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
});
