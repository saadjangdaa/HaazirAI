import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';

const WEEK_BARS = [40, 65, 50, 80, 95, 70, 88];
const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const PAYMENTS = [
  { name: 'Ahmed', amount: 'Rs 900', received: false },
  { name: 'Sara', amount: 'Rs 1,200', received: true },
  { name: 'Fatima', amount: 'Rs 800', received: true },
];

export default function WorkerEarningsScreen() {
  const maxBar = Math.max(...WEEK_BARS);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Meri Kamai 💰</Text>

      {/* Today + Rating */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, Shadow.card]}>
          <Text style={styles.statLabel}>Aaj</Text>
          <Text style={[styles.statValue, { color: Colors.warning }]}>Rs 3,200</Text>
          <Text style={styles.statSub}>4 kaam</Text>
        </View>
        <View style={[styles.statCard, Shadow.card]}>
          <Text style={styles.statLabel}>Rating</Text>
          <Text style={styles.statValue}>⭐ 4.9</Text>
          <Text style={styles.statSub}>On-Time 96%</Text>
        </View>
        <View style={[styles.statCard, Shadow.card]}>
          <Text style={styles.statLabel}>Is Hafte</Text>
          <Text style={[styles.statValue, { color: Colors.primary }]}>Rs 18.4k</Text>
          <Text style={styles.statSub}>22 kaam</Text>
        </View>
      </View>

      {/* AI Voice Report */}
      <View style={[styles.aiCard, Shadow.card]}>
        <View style={styles.aiHeader}>
          <Text style={styles.aiIcon}>✨</Text>
          <Text style={styles.aiTitle}>AI Voice Report</Text>
        </View>
        <Text style={styles.aiText}>
          "Aaj 4 kaam, Rs 3,200 — kal 3 bookings pending. Wah ustad! 🎉"
        </Text>
        <TouchableOpacity style={styles.playBtn}>
          <Text style={styles.playBtnText}>▶ Sunein</Text>
        </TouchableOpacity>
      </View>

      {/* Weekly Bar Chart */}
      <View style={[styles.chartCard, Shadow.card]}>
        <Text style={styles.chartTitle}>This Week</Text>
        <View style={styles.barsContainer}>
          {WEEK_BARS.map((h, i) => (
            <View key={i} style={styles.barWrapper}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${(h / maxBar) * 100}%` as any }]} />
              </View>
              <Text style={styles.barDay}>{WEEK_DAYS[i]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Demand Forecast */}
      <View style={[styles.forecastCard, Shadow.card]}>
        <Text style={styles.forecastTitle}>📈 Demand Forecast</Text>
        <Text style={styles.forecastText}>
          Kal AC requests zyada hongi — online rahein!
        </Text>
      </View>

      {/* Pending Payments */}
      <Text style={styles.sectionTitle}>Payments</Text>
      {PAYMENTS.map((p, i) => (
        <View key={i} style={[styles.paymentCard, Shadow.card]}>
          <View style={styles.paymentRow}>
            <View>
              <Text style={styles.paymentName}>{p.name}</Text>
              <Text style={styles.paymentAmount}>{p.amount}</Text>
            </View>
            {p.received ? (
              <View style={styles.receivedBadge}>
                <Text style={styles.receivedText}>Received ✅</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.remindBtn}>
                <Text style={styles.remindBtnText}>Remind</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  statSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  aiCard: { backgroundColor: '#FFFBEB', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.warning + '55', padding: Spacing.md, marginBottom: Spacing.md },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  aiIcon: { fontSize: 16 },
  aiTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.warning },
  aiText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', marginBottom: Spacing.sm },
  playBtn: { backgroundColor: Colors.warning, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, alignSelf: 'flex-start' },
  playBtnText: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '700' },
  chartCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  chartTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  barsContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: Spacing.xs },
  barWrapper: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  barDay: { fontSize: FontSize.xs, color: Colors.textMuted },
  forecastCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryDim, padding: Spacing.md, marginBottom: Spacing.md },
  forecastTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  forecastText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  paymentCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  paymentAmount: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  receivedBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  receivedText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  remindBtn: { borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  remindBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
});
