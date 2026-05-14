import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { getProviderReport, DailyReport } from '../services/api';

interface Props {
  providerId: string;
}

export default function ProviderDashboard({ providerId }: Props) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProviderReport(providerId)
      .then(setReport)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [providerId]);

  const handleVoiceReport = () => {
    Alert.alert(
      '🔊 Voice Report',
      report?.voice_summary_urdu || 'Koi summary nahi mili',
      [{ text: 'Theek Hai', style: 'default' }]
    );
  };

  if (loading) return <ActivityIndicator color={Colors.primary} style={{ padding: Spacing.xl }} />;
  if (!report) return <Text style={{ color: Colors.danger, padding: Spacing.md }}>Report load nahi ho saka</Text>;

  const demandDays = [
    { day: 'Mon', level: 0.6 },
    { day: 'Tue', level: 0.8 },
    { day: 'Wed', level: 0.9 },
    { day: 'Thu', level: 0.7 },
    { day: 'Fri', level: 1.0 },
    { day: 'Sat', level: 0.85 },
    { day: 'Sun', level: 0.5 },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>📊 Provider Dashboard</Text>
      <Text style={styles.providerName}>{report.provider_name}</Text>
      <Text style={styles.date}>{report.date}</Text>

      {/* Earnings Summary */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{report.jobs_completed}</Text>
          <Text style={styles.statLabel}>Kaam Aaj</Text>
        </View>
        <View style={[styles.statCard, styles.statCardPrimary]}>
          <Text style={[styles.statValue, styles.statValuePrimary]}>
            Rs {report.total_earnings.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Aaj Ki Kamai</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{report.average_rating.toFixed(1)} ⭐</Text>
          <Text style={styles.statLabel}>Avg Rating</Text>
        </View>
      </View>

      {/* Pending Payment */}
      {report.pending_payments > 0 && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingLabel}>⏳ Pending Payment</Text>
          <Text style={styles.pendingValue}>Rs {report.pending_payments.toLocaleString()}</Text>
        </View>
      )}

      {/* Voice Report Button */}
      <TouchableOpacity style={[styles.voiceBtn, Shadow.primary]} onPress={handleVoiceReport}>
        <Text style={styles.voiceBtnText}>🔊 Urdu Voice Report Sunein</Text>
      </TouchableOpacity>

      {/* Upcoming Bookings */}
      <Text style={styles.sectionTitle}>📅 Upcoming Bookings ({report.upcoming_bookings.length})</Text>
      {report.upcoming_bookings.length === 0 ? (
        <Text style={styles.emptyText}>Koi upcoming booking nahi</Text>
      ) : (
        report.upcoming_bookings.map((b: any, i) => (
          <View key={i} style={styles.bookingItem}>
            <View>
              <Text style={styles.bookingService}>{b.service || 'Service'}</Text>
              <Text style={styles.bookingTime}>{b.time}</Text>
            </View>
            <Text style={styles.bookingPrice}>Rs {(b.price || 0).toLocaleString()}</Text>
          </View>
        ))
      )}

      {/* Demand Forecast */}
      <Text style={styles.sectionTitle}>📈 Demand Forecast (7 din)</Text>
      <View style={styles.demandChart}>
        {demandDays.map((d) => (
          <View key={d.day} style={styles.demandBar}>
            <View style={[styles.demandFill, { height: `${Math.round(d.level * 100)}%` as any }]} />
            <Text style={styles.demandDay}>{d.day}</Text>
          </View>
        ))}
      </View>

      {/* Suggestions */}
      <Text style={styles.sectionTitle}>💡 Suggestions</Text>
      {report.predictive_suggestions.map((s, i) => (
        <View key={i} style={styles.suggestionItem}>
          <Text style={styles.suggestionText}>{s}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { color: Colors.primary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: 4 },
  providerName: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  date: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statCardPrimary: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
  statValue: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: 2 },
  statValuePrimary: { color: Colors.primary },
  statLabel: { color: Colors.textMuted, fontSize: FontSize.xs },
  pendingCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.warningDim, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.warning },
  pendingLabel: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '600' },
  pendingValue: { color: Colors.warning, fontSize: FontSize.lg, fontWeight: '800' },
  voiceBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.lg },
  voiceBtnText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '800' },
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.sm },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm },
  bookingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.border },
  bookingService: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  bookingTime: { color: Colors.textMuted, fontSize: FontSize.xs },
  bookingPrice: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  demandChart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md, gap: 4 },
  demandBar: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  demandFill: { width: '80%', backgroundColor: Colors.primary, borderRadius: 2, minHeight: 4 },
  demandDay: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  suggestionItem: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.xs, borderLeftWidth: 3, borderLeftColor: Colors.primary },
  suggestionText: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 18 },
});
