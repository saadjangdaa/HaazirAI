import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuth, formatAuthBootstrapError } from '../context/AuthContext';
import { useLang, LANGUAGE_LABELS } from '../context/LanguageContext';
import { formatAuthError } from '../utils/authErrors';
import type { Language } from '../constants/translations';

const ALL_LANGS = Object.entries(LANGUAGE_LABELS) as [Language, string][];

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, loading } = useAuth();
  const { language, setLanguage, tr } = useLang();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Fields khali hain', 'Email aur password daalna zaroori hai');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      const msg = (e as { code?: string })?.code?.startsWith('auth/')
        ? formatAuthError(e)
        : formatAuthBootstrapError(e);
      Alert.alert('Login fail', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Language picker */}
        <TouchableOpacity style={styles.langBtn} onPress={() => setShowLangPicker(true)}>
          <Text style={styles.langBtnText}>🌐 {LANGUAGE_LABELS[language]}</Text>
        </TouchableOpacity>

        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.brandEmoji}>🤝</Text>
          <Text style={styles.brandName}>Haazir AI</Text>
          <Text style={styles.brandTagline}>Pakistan ka Pehla Agentic Home Services</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.heading}>{tr.welcome}</Text>
          <Text style={styles.sub}>{tr.loginSub}</Text>

          <Text style={styles.label}>{tr.email}</Text>
          <TextInput
            style={styles.input}
            placeholder="aapka@email.com"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Text style={styles.label}>{tr.password}</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btn, Shadow.primary]}
            onPress={handleLogin}
            disabled={busy || loading}
          >
            {busy ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.btnText}>{tr.loginBtn}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ya</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/signup')}>
            <Text style={styles.secondaryBtnText}>{tr.signupBtn}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
                <Text style={[styles.langOptionText, language === code && styles.langOptionTextActive]}>
                  {label}
                </Text>
                {language === code && <Text style={styles.langCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  langBtn: {
    alignSelf: 'flex-end', backgroundColor: Colors.surface, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  langBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700' },
  brand: { alignItems: 'center', marginBottom: Spacing.xl },
  brandEmoji: { fontSize: 56, marginBottom: Spacing.sm },
  brandName: { fontSize: FontSize.xxxl, fontWeight: '800', color: Colors.primary },
  brandTagline: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  heading: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.inputBg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, fontSize: FontSize.md, color: Colors.textPrimary, marginBottom: Spacing.md,
  },
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  btnText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '800' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: FontSize.sm, marginHorizontal: Spacing.sm },
  secondaryBtn: { borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.primary, padding: Spacing.md, alignItems: 'center' },
  secondaryBtnText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: 40 },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md, textAlign: 'center' },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.xs },
  langOptionActive: { backgroundColor: Colors.primaryDim },
  langOptionText: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  langOptionTextActive: { color: Colors.primary, fontWeight: '800' },
  langCheck: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '800' },
});
