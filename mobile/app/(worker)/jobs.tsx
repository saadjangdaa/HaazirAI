import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';

const ACTIVE_JOBS = [
  { svc: 'AC Service', who: 'Fatima · G-10', time: '12:30 PM', status: 'En Route', price: 'Rs 1,200' },
  { svc: 'Electrician', who: 'Bilal · F-7', time: '3:00 PM', status: 'Pending', price: 'Rs 800' },
];

export default function WorkerJobsScreen() {
  const { user } = useAuth();
  const [online, setOnline] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [countdown, setCountdown] = useState(59);

  useEffect(() => {
    if (accepted) return;
    const t = setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [accepted]);

  const displayName = user?.name || 'Worker';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarBox}><Text style={styles.avatarIcon}>🔧</Text></View>
          <View>
            <Text style={styles.headerName}>{displayName}</Text>
            <Text style={styles.headerSub}>
              {user?.workerData?.specializations?.join(', ') || 'Haazir Worker'}
            </Text>
          </View>
        </View>
        <View style={styles.onlineRow}>
          <Text style={[styles.onlineText, { color: online ? Colors.primary : Colors.textMuted }]}>
            {online ? 'Online' : 'Offline'}
          </Text>
          <Switch
            value={online}
            onValueChange={setOnline}
            trackColor={{ false: Colors.border, true: Colors.primaryDim }}
            thumbColor={online ? Colors.primary : Colors.textMuted}
          />
        </View>
      </View>

      {online ? (
        <Text style={styles.statusText}>Aap Online Hain ✅ — Naye kaam aa rahe hain</Text>
      ) : (
        <Text style={[styles.statusText, { color: Colors.textMuted }]}>Aap Offline Hain — Online hojayein kaam pane ke liye</Text>
      )}

      {/* New Job Notification */}
      {online && !accepted && countdown > 0 && (
        <View style={[styles.newJobCard, Shadow.card]}>
          <View style={styles.newJobHeader}>
            <View style={styles.newJobBadge}>
              <Text style={styles.newJobBadgeText}>🔔 Naya Kaam!</Text>
            </View>
            <Text style={styles.countdownText}>{countdown}s</Text>
          </View>
          <Text style={styles.newJobTitle}>AC Repair (Complex ⚙️)</Text>
          <Text style={styles.newJobMeta}>Ahmed · G-13 · 1.8km · Kal 10:00 AM</Text>
          <View style={styles.newJobPriceRow}>
            <Text style={styles.newJobPriceLabel}>Offered:</Text>
            <Text style={styles.newJobPrice}>Rs 900</Text>
          </View>
          <View style={styles.newJobBtns}>
            <TouchableOpacity style={[styles.acceptBtn, Shadow.primary]} onPress={() => setAccepted(true)}>
              <Text style={styles.acceptBtnText}>✅ Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineBtn} onPress={() => setCountdown(0)}>
              <Text style={styles.declineBtnText}>❌ Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {accepted && (
        <View style={[styles.acceptedCard, Shadow.card]}>
          <Text style={styles.acceptedText}>✅ Kaam Accept Ho Gaya!</Text>
          <Text style={styles.acceptedMeta}>AC Repair · Ahmed · G-13 · Kal 10:00 AM</Text>
        </View>
      )}

      {/* Conflict warning */}
      <View style={styles.warningCard}>
        <Text style={styles.warningText}>
          ⚠️ Ye slot aapke doosre kaam se overlap kar raha hai — 11 AM lein?
        </Text>
      </View>

      {/* Active Jobs */}
      <Text style={styles.sectionTitle}>Active Jobs</Text>
      {ACTIVE_JOBS.map((job, i) => (
        <View key={i} style={[styles.jobCard, Shadow.card]}>
          <View style={styles.jobRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobSvc}>{job.svc}</Text>
              <Text style={styles.jobMeta}>{job.who} · {job.time}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.statusBadge, job.status === 'En Route' ? styles.statusGreen : styles.statusGray]}>
                <Text style={[styles.statusBadgeText, { color: job.status === 'En Route' ? Colors.primary : Colors.textMuted }]}>
                  {job.status}
                </Text>
              </View>
              <Text style={styles.jobPrice}>{job.price}</Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatarBox: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center' },
  avatarIcon: { fontSize: 20 },
  headerName: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, maxWidth: 160 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  onlineText: { fontSize: FontSize.xs, fontWeight: '700' },
  statusText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.md },
  newJobCard: { backgroundColor: '#FFFBEB', borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning, padding: Spacing.md, marginBottom: Spacing.md },
  newJobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  newJobBadge: { backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  newJobBadgeText: { color: Colors.background, fontSize: FontSize.xs, fontWeight: '800' },
  countdownText: { color: Colors.warning, fontSize: FontSize.md, fontWeight: '800', fontVariant: ['tabular-nums'] },
  newJobTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  newJobMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  newJobPriceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  newJobPriceLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  newJobPrice: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary },
  newJobBtns: { flexDirection: 'row', gap: Spacing.sm },
  acceptBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
  acceptBtnText: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '800' },
  declineBtn: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  declineBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700' },
  acceptedCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary },
  acceptedText: { fontSize: FontSize.md, fontWeight: '800', color: Colors.primary },
  acceptedMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  warningCard: { backgroundColor: '#FFFBEB', borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44' },
  warningText: { fontSize: FontSize.xs, color: Colors.warning },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  jobCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  jobRow: { flexDirection: 'row', alignItems: 'center' },
  jobSvc: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  jobMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2, marginBottom: 4 },
  statusGreen: { backgroundColor: Colors.surfaceElevated },
  statusGray: { backgroundColor: Colors.border },
  statusBadgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  jobPrice: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
});
