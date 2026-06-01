import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, Switch, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useLang, LANGUAGE_LABELS } from '../../context/LanguageContext';
import { useMockData } from '../../context/MockDataContext';
import { syncUserProfile } from '../../services/api';
import type { Language } from '../../constants/translations';

const ALL_LANGS = Object.entries(LANGUAGE_LABELS) as [Language, string][];
const CITIES = ['Karachi', 'Lahore', 'Islamabad'] as const;

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
  const { isMockMode, toggleMockMode } = useMockData();
  const [availability, setAvailability] = useState([true, true, true, true, true, true, false]);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [selectedCity, setSelectedCity] = useState(user?.city || '');
  const [savingCity, setSavingCity] = useState(false);

  const handleCitySelect = async (city: string) => {
    if (isMockMode) { setSelectedCity(city); return; }
    if (!user?.id) return;
    setSelectedCity(city);
    setSavingCity(true);
    try {
      await syncUserProfile({ user_id: user.id, email: user.email, role: user.role, city });
    } catch {
      // silently ignore — optimistic update
    } finally {
      setSavingCity(false);
    }
  };

  const toggleDay = (i: number) =>
    setAvailability((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  const doLogout = async () => {
    try { await signOut(); } finally { router.replace('/login'); }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      doLogout();
      return;
    }
    Alert.alert(tr.logout, tr.logoutConfirm, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.logout, style: 'destructive', onPress: doLogout },
    ]);
  };

  const insets = useSafeAreaInsets();
  const specs = user?.workerData?.specializations || ['AC Repair', 'Complex Jobs', 'Plumbing'];
  const areas = user?.workerData?.areas || ['Islamabad', 'Rawalpindi'];
  const displayName = user?.username || user?.email?.split('@')[0] || 'Worker';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={styles.root}>
    <View style={[styles.screenHeader, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.screenHeaderTitle}>{tr.profile}</Text>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
      <Text style={[styles.title, { display: 'none' }]}>{tr.profile}</Text>

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
            <Text style={[styles.statVal, { color: Colors.primary }]}>Rs 18.4k</Text>
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

      {/* Demo Mode Toggle */}
      <View style={[styles.card, Shadow.card, isMockMode && { borderColor: Colors.primary, backgroundColor: Colors.primaryLight }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { marginBottom: 2 }, isMockMode && { color: Colors.primary }]}>
              🎭 Demo Mode
            </Text>
            <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>
              {isMockMode
                ? 'Worker: Mohammad Rashid · 3 jobs · earnings active'
                : 'Judges ke liye sample worker data on karein'}
            </Text>
          </View>
          <Switch
            value={isMockMode}
            onValueChange={toggleMockMode}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={isMockMode ? Colors.textInverse : Colors.textMuted}
          />
        </View>
      </View>

      {/* Language Picker */}
      <TouchableOpacity style={[styles.card, Shadow.card, { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]} onPress={() => setShowLangPicker(true)}>
        <Text style={{ fontSize: 18, width: 28 }}>🌐</Text>
        <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]}>{tr.language}</Text>
        <Text style={{ fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700', marginRight: 4 }}>{LANGUAGE_LABELS[language]}</Text>
        <Text style={{ fontSize: FontSize.xl, color: Colors.textMuted }}>›</Text>
      </TouchableOpacity>

      {/* City Picker */}
      <View style={[styles.cityCard, Shadow.card]}>
        <View style={styles.cityHeader}>
          <Ionicons name="location-outline" size={16} color={Colors.primary} />
          <Text style={styles.cityTitle}>Apna Shehar</Text>
          {savingCity && <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 'auto' }} />}
          {!savingCity && selectedCity ? (
            <View style={styles.citySavedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
              <Text style={styles.citySavedText}>Saved</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cityChips}>
          {CITIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.cityChip, selectedCity === c && styles.cityChipActive]}
              onPress={() => handleCitySelect(c)}
              activeOpacity={0.75}
            >
              <Text style={[styles.cityChipText, selectedCity === c && styles.cityChipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.cityHint}>Aapke shehar ke jobs aapko milenge</Text>
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  screenHeader: {
    paddingHorizontal: 20, paddingBottom: 10,
    backgroundColor: Colors.background,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  screenHeaderTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  profileCard: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  profileRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primary },
  profileName: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  profileMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, marginBottom: Spacing.xs },
  badgeRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  badge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.xs },
  chip: { backgroundColor: Colors.primaryLight, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primaryDim, paddingHorizontal: 10, paddingVertical: 4 },
  chipBlue: { backgroundColor: '#E0F2FE', borderColor: '#0284C733' },
  chipText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  certBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: 6, alignSelf: 'flex-start' },
  certText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  docRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  docName: { fontSize: FontSize.sm, color: Colors.textPrimary },
  verifiedBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  pendingBadge: { backgroundColor: Colors.primaryDim, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  pendingText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  daysRow: { flexDirection: 'row', gap: Spacing.xs },
  dayBtn: { flex: 1, aspectRatio: 1, borderRadius: Radius.sm, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  dayBtnActive: { backgroundColor: Colors.primary, borderWidth: 0 },
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
  langOptionActive: { backgroundColor: Colors.primaryLight },
  langOptionText: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  langOptionTextActive: { color: Colors.primary, fontWeight: '800' },
  langCheck: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '800' },

  cityCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  cityHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  cityTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  citySavedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', backgroundColor: Colors.successDim, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  citySavedText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '700' },
  cityChips: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  cityChip: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.inputBg },
  cityChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
  cityChipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  cityChipTextActive: { color: Colors.primary, fontWeight: '800' },
  cityHint: { fontSize: FontSize.xs, color: Colors.textMuted },
});
