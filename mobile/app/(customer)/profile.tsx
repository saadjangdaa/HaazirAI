import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, Switch, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import CustomerSidebar from '../../components/CustomerSidebar';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useLang, LANGUAGE_LABELS } from '../../context/LanguageContext';
import { useMockData } from '../../context/MockDataContext';
import { getUserBookings, requireUserId } from '../../services/api';
import { MOCK_CUSTOMER_STATS } from '../../data/mockData';
import type { Language } from '../../constants/translations';

const ALL_LANGS = Object.entries(LANGUAGE_LABELS) as [Language, string][];

const MENU_ITEMS = [
  { label: 'Saved Addresses', icon: '📍' },
  { label: 'Payment Methods', icon: '💳' },
  { label: 'Notifications', icon: '🔔' },
  { label: 'Help & Support', icon: '❓' },
  { label: 'Agent Logs (Judges)', icon: '🤖', judges: true },
];

interface Stats {
  totalBookings: number;
  totalSpent: number;
  saved: number;
}

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { tr, language, setLanguage } = useLang();
  const { isMockMode, toggleMockMode } = useMockData();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const insets = useSafeAreaInsets();
  const displayName = user?.username || user?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    if (isMockMode) {
      setStats(MOCK_CUSTOMER_STATS);
      return;
    }
    if (!user?.id) return;
    let cancelled = false;
    try {
      const uid = requireUserId(user);
      getUserBookings(uid).then((bookings) => {
        if (cancelled) return;
        const totalSpent = bookings.reduce((s, b) => s + (Number(b.price) || 0), 0);
        setStats({ totalBookings: bookings.length, totalSpent, saved: 0 });
      }).catch(() => {});
    } catch {}
    return () => { cancelled = true; };
  }, [user?.id, isMockMode]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  return (
    <View style={styles.rootWrap}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
          <Ionicons name="menu" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>

      {/* Demo Mode Banner */}
      {isMockMode && (
        <View style={styles.mockBanner}>
          <Text style={styles.mockBannerText}>🎭 DEMO MODE — Sample data active</Text>
        </View>
      )}

      {/* Identity */}
      <View style={[styles.profileCard, Shadow.card]}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{isMockMode ? 'Ahmed Ali' : displayName}</Text>
            <Text style={styles.profileMeta}>{isMockMode ? 'ahmed.ali@gmail.com' : user?.email}</Text>
            {!isMockMode && user?.phone ? <Text style={styles.profileMeta}>📱 {user.phone}</Text> : null}
            {isMockMode ? <Text style={styles.profileMeta}>📱 0300-1234567</Text> : null}
            {!user?.profileComplete && !isMockMode ? (
              <TouchableOpacity onPress={() => router.push('/signup')}>
                <Text style={styles.completeLink}>Complete profile →</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.loyalBadge}>
              <Text style={styles.loyalText}>Loyal Customer ⭐</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={[styles.statsCard, Shadow.card]}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: Colors.primary }]}>
              {stats != null ? stats.totalBookings : '—'}
            </Text>
            <Text style={styles.statLabel}>Bookings</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>
              {stats != null ? `Rs ${(stats.totalSpent / 1000).toFixed(1)}k` : '—'}
            </Text>
            <Text style={styles.statLabel}>Spent</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: Colors.primary }]}>
              {stats != null && stats.saved > 0 ? `Rs ${stats.saved}` : isMockMode ? 'Rs 350' : '—'}
            </Text>
            <Text style={styles.statLabel}>Saved</Text>
          </View>
        </View>
      </View>

      {/* Menu */}
      <View style={[styles.menuCard, Shadow.card]}>
        {MENU_ITEMS.map((item, i) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuItem, i < MENU_ITEMS.length - 1 && styles.menuItemBorder]}
            onPress={() => item.judges && router.push('/logs')}
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={[styles.menuLabel, item.judges && { color: Colors.primary }]}>{item.label}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Demo Mode Toggle */}
      <View style={[styles.demoCard, Shadow.card, isMockMode && styles.demoCardActive]}>
        <View style={styles.demoRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.demoTitle, isMockMode && styles.demoTitleActive]}>
              🎭 Demo Mode
            </Text>
            <Text style={styles.demoSub}>
              {isMockMode
                ? 'Sample Pakistani data active — judges ke liye'
                : 'Judges ko show karne ke liye sample data on karein'}
            </Text>
          </View>
          <Switch
            value={isMockMode}
            onValueChange={toggleMockMode}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={isMockMode ? Colors.textInverse : Colors.textMuted}
          />
        </View>
        {isMockMode && (
          <Text style={styles.demoNote}>
            User: Ahmed Ali · 4 bookings · 1 active job · dispute resolved
          </Text>
        )}
      </View>

      {/* Haazir AI info */}
      <View style={[styles.aiCard, Shadow.card]}>
        <Text style={styles.aiTitle}>🤖 Haazir AI</Text>
        <Text style={styles.aiText}>
          Pakistan's first agentic home services platform. 9 AI agents milkar aapka best provider chunte hain — bilkul fikr mat karo!
        </Text>
      </View>

      {/* Language Picker */}
      <TouchableOpacity style={[styles.menuCard, Shadow.card, { marginBottom: Spacing.md }]} onPress={() => setShowLangPicker(true)}>
        <View style={styles.langRow}>
          <Text style={styles.menuIcon}>🌐</Text>
          <Text style={[styles.menuLabel, { flex: 1 }]}>{tr.language}</Text>
          <Text style={styles.langCurrent}>{LANGUAGE_LABELS[language]}</Text>
          <Text style={styles.menuArrow}>›</Text>
        </View>
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>↩ {tr.logout}</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Haazir AI v1.0 · Google Antigravity Hackathon</Text>

      {/* Language Picker Modal */}
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

      <CustomerSidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrap: { flex: 1, backgroundColor: Colors.background },
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  menuBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  content: { padding: Spacing.md, paddingBottom: 48 },

  mockBanner: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  mockBannerText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },

  profileCard: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  profileRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.surfaceElevated, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.primary },
  avatarText: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primary },
  profileName: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  profileMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, marginBottom: Spacing.xs },
  completeLink: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700', marginTop: 4 },
  loyalBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  loyalText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

  statsCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.border },

  menuCard: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  menuIcon: { fontSize: 18, width: 28 },
  menuLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  menuArrow: { fontSize: FontSize.xl, color: Colors.textMuted },

  demoCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  demoCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  demoTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  demoTitleActive: { color: Colors.primary },
  demoSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  demoNote: { fontSize: FontSize.xs, color: Colors.primary, marginTop: Spacing.sm, fontWeight: '600' },

  aiCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryDim, padding: Spacing.md, marginBottom: Spacing.md },
  aiTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  aiText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  logoutBtn: { borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.danger, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  logoutText: { color: Colors.danger, fontSize: FontSize.md, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.textMuted },

  langRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  langCurrent: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700', marginRight: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: 40 },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md, textAlign: 'center' },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.xs },
  langOptionActive: { backgroundColor: Colors.primaryDim },
  langOptionText: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  langOptionTextActive: { color: Colors.primary, fontWeight: '800' },
  langCheck: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '800' },
});
