import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useLang, LANGUAGE_LABELS } from '../../context/LanguageContext';
import type { Language } from '../../constants/translations';

const ALL_LANGS = Object.entries(LANGUAGE_LABELS) as [Language, string][];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DOCS = [
  { name: 'CNIC', verified: true },
  { name: 'Background Check', verified: true },
  { name: 'Skill Certificate', verified: false },
];

export default function WorkerProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { tr, language, setLanguage } = useLang();
  const [availability, setAvailability] = useState([true, true, true, true, true, true, false]);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const toggleDay = (i: number) =>
    setAvailability((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  const handleLogout = () => {
    Alert.alert(tr.logout, tr.logoutConfirm, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.logout, style: 'destructive', onPress: () => { signOut(); router.replace('/login'); } },
    ]);
  };

  const insets = useSafeAreaInsets();
  const specs = user?.workerData?.specializations || ['AC Repair', 'Complex Jobs', 'Plumbing'];
  const areas = user?.workerData?.areas || ['Islamabad', 'Rawalpindi'];
  const displayName = user?.username || user?.email?.split('@')[0] || 'Worker';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.title}>{tr.profile}</Text>

      {/* Identity Card */}
      <View style={[styles.profileCard, Shadow.card]}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileMeta}>⭐ 4.8 · 247 jobs · Member Jan 2023</Text>
            <View style={styles.badgeRow}>
              <View style={styles.badge}><Text style={styles.badgeText}>On-Time 96% ✅</Text></View>
              <View style={styles.badge}><Text style={styles.badgeText}>Low Risk 🟢</Text></View>
            </View>
          </View>
        </View>
      </View>

      {/* Specializations */}
      <View style={[styles.card, Shadow.card]}>
        <Text style={styles.cardTitle}>Specializations</Text>
        <View style={styles.chipRow}>
          {specs.map((s) => (
            <View key={s} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>
          ))}
        </View>
        <View style={styles.chipRow}>
          {areas.map((a) => (
            <View key={a} style={[styles.chip, styles.chipBlue]}><Text style={[styles.chipText, { color: '#0369A1' }]}>📍 {a}</Text></View>
          ))}
        </View>
        <View style={[styles.certBadge, { marginTop: Spacing.sm }]}>
          <Text style={styles.certText}>✅ Complex Jobs Certified</Text>
        </View>
      </View>

      {/* Documents */}
      <View style={[styles.card, Shadow.card]}>
        <Text style={styles.cardTitle}>Documents</Text>
        {DOCS.map((d) => (
          <View key={d.name} style={styles.docRow}>
            <Text style={styles.docName}>{d.name}</Text>
            {d.verified ? (
              <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✅ Verified</Text></View>
            ) : (
              <View style={styles.pendingBadge}><Text style={styles.pendingText}>⏳ Pending</Text></View>
            )}
          </View>
        ))}
      </View>

      {/* Availability */}
      <View style={[styles.card, Shadow.card]}>
        <Text style={styles.cardTitle}>Availability (Tap to Toggle)</Text>
        <View style={styles.daysRow}>
          {DAYS.map((d, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dayBtn, availability[i] && styles.dayBtnActive]}
              onPress={() => toggleDay(i)}
            >
              <Text style={[styles.dayText, availability[i] && styles.dayTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Stats */}
      <View style={[styles.card, Shadow.card]}>
        <Text style={styles.cardTitle}>Performance</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: Colors.warning }]}>Rs 18.4k</Text>
            <Text style={styles.statLabel}>Is Hafte</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>247</Text>
            <Text style={styles.statLabel}>Total Jobs</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: Colors.primary }]}>4.8⭐</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>
      </View>

      {/* Language Picker */}
      <TouchableOpacity style={[styles.card, Shadow.card, { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]} onPress={() => setShowLangPicker(true)}>
        <Text style={{ fontSize: 18, width: 28 }}>🌐</Text>
        <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]}>{tr.language}</Text>
        <Text style={{ fontSize: FontSize.sm, color: Colors.warning, fontWeight: '700', marginRight: 4 }}>{LANGUAGE_LABELS[language]}</Text>
        <Text style={{ fontSize: FontSize.xl, color: Colors.textMuted }}>›</Text>
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>{tr.logout}</Text>
      </TouchableOpacity>

      {/* Language Modal */}
      <Modal visible={showLangPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowLangPicker(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>🌐 {tr.selectLanguage}</Text>
            {ALL_LANGS.map(([code, label]) => (
              <TouchableOpacity
                key={code}
                style={[styles.langOption, language === code && styles.langOptionActive]}
                onPress={() => { setLanguage(code); setShowLangPicker(false); }}
              >
                <Text style={[styles.langOptionText, language === code && styles.langOptionTextActive]}>{label}</Text>
                {language === code && <Text style={styles.langCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  profileCard: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  profileRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.warning },
  profileName: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  profileMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, marginBottom: Spacing.xs },
  badgeRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  badge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.xs },
  chip: { backgroundColor: '#FFFBEB', borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.warning + '66', paddingHorizontal: 10, paddingVertical: 4 },
  chipBlue: { backgroundColor: '#E0F2FE', borderColor: '#0284C733' },
  chipText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.warning },
  certBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: 6, alignSelf: 'flex-start' },
  certText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  docRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  docName: { fontSize: FontSize.sm, color: Colors.textPrimary },
  verifiedBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  pendingBadge: { backgroundColor: Colors.warningDim, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  pendingText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.warning },
  daysRow: { flexDirection: 'row', gap: Spacing.xs },
  dayBtn: { flex: 1, aspectRatio: 1, borderRadius: Radius.sm, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  dayBtnActive: { backgroundColor: Colors.warning },
  dayText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted },
  dayTextActive: { color: Colors.background },
  statsRow: { flexDirection: 'row' },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  logoutBtn: { borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.danger, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  logoutText: { color: Colors.danger, fontSize: FontSize.md, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: 40 },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md, textAlign: 'center' },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.xs },
  langOptionActive: { backgroundColor: '#FFFBEB' },
  langOptionText: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  langOptionTextActive: { color: Colors.warning, fontWeight: '800' },
  langCheck: { color: Colors.warning, fontSize: FontSize.lg, fontWeight: '800' },
});
