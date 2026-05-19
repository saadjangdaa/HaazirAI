import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useLang, LANGUAGE_LABELS } from '../../context/LanguageContext';
import type { Language } from '../../constants/translations';

const ALL_LANGS = Object.entries(LANGUAGE_LABELS) as [Language, string][];

const MENU_ITEMS = [
  { label: 'Saved Addresses', icon: '📍' },
  { label: 'Payment Methods', icon: '💳' },
  { label: 'Notifications', icon: '🔔' },
  { label: 'Help & Support', icon: '❓' },
  { label: 'Agent Logs (Judges)', icon: '🤖', judges: true },
];

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { tr, language, setLanguage } = useLang();
  const [showLangPicker, setShowLangPicker] = useState(false);

  const insets = useSafeAreaInsets();
  const displayName = user?.username || user?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  const handleLogout = () => {
    Alert.alert(tr.logout, tr.logoutConfirm, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.logout,
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } finally {
            router.replace('/login');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      {/* Identity */}
      <View style={[styles.profileCard, Shadow.card]}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileMeta}>{user?.email}</Text>
            {user?.phone ? <Text style={styles.profileMeta}>📱 {user.phone}</Text> : null}
            {user?.cnic ? <Text style={styles.profileMeta}>🪪 CNIC ····{user.cnic.slice(-4)}</Text> : null}
            {!user?.profileComplete ? (
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
            <Text style={[styles.statVal, { color: Colors.primary }]}>12</Text>
            <Text style={styles.statLabel}>Bookings</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>Rs 14k</Text>
            <Text style={styles.statLabel}>Spent</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: Colors.primary }]}>Rs 350</Text>
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
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
