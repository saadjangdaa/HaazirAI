import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useLang, LANGUAGE_LABELS } from '../context/LanguageContext';
import type { Language } from '../constants/translations';

const ALL_LANGS = Object.entries(LANGUAGE_LABELS) as [Language, string][];

const LANG_SUBTITLES: Record<Language, string> = {
  roman_urdu: 'Roman Urdu',
  urdu: 'اردو — دائیں سے بائیں',
  sindhi: 'سنڌي — سنڌ جي ٻولي',
  pashto: 'پښتو — د پښتنو ژبه',
  balochi: 'بلوچی — بلوچستان جی زبان',
};

const LANG_ICONS: Record<Language, string> = {
  roman_urdu: '🇵🇰',
  urdu: '🕌',
  sindhi: '🌊',
  pashto: '⛰️',
  balochi: '🏜️',
};

export default function LanguageSelectScreen() {
  const router = useRouter();
  const { user, completeLanguageSelect } = useAuth();
  const { language, setLanguage } = useLang();
  const insets = useSafeAreaInsets();

  const handleContinue = () => {
    completeLanguageSelect();
    router.replace(user?.role === 'worker' ? '/(worker)/jobs' : '/');
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      {/* Branding */}
      <View style={styles.brand}>
        <Text style={styles.brandEmoji}>🤝</Text>
        <Text style={styles.brandName}>Haazir AI</Text>
        <Text style={styles.brandTagline}>Apni zaban chunein</Text>
        <Text style={styles.brandSub}>Choose your language</Text>
      </View>

      {/* Language Cards */}
      <View style={styles.langList}>
        {ALL_LANGS.map(([code, label]) => {
          const active = language === code;
          return (
            <TouchableOpacity
              key={code}
              style={[styles.langCard, active && styles.langCardActive, Shadow.card]}
              onPress={() => setLanguage(code)}
              activeOpacity={0.8}
            >
              <Text style={styles.langIcon}>{LANG_ICONS[code]}</Text>
              <View style={styles.langInfo}>
                <Text style={[styles.langLabel, active && styles.langLabelActive]}>{label}</Text>
                <Text style={[styles.langSub, active && styles.langSubActive]}>{LANG_SUBTITLES[code]}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Continue Button */}
      <TouchableOpacity
        style={[styles.continueBtn, Shadow.primary]}
        onPress={handleContinue}
        activeOpacity={0.85}
      >
        <Text style={styles.continueBtnText}>Shuru Karein  →</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>Baad mein Profile mein bhi badal sakte hain</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, flexGrow: 1 },
  brand: { alignItems: 'center', marginBottom: Spacing.xl },
  brandEmoji: { fontSize: 64, marginBottom: Spacing.sm },
  brandName: { fontSize: FontSize.xxxl, fontWeight: '800', color: Colors.primary },
  brandTagline: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
  brandSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  langList: { gap: Spacing.sm, marginBottom: Spacing.xl },
  langCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.border,
  },
  langCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
  langIcon: { fontSize: 32, width: 44, textAlign: 'center' },
  langInfo: { flex: 1 },
  langLabel: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  langLabelActive: { color: Colors.primary },
  langSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  langSubActive: { color: Colors.primary + 'AA' },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  continueBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    padding: Spacing.md + 2, alignItems: 'center', marginBottom: Spacing.md,
  },
  continueBtnText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
  hint: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.textMuted },
});
