import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Alert, Modal, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
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
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  // Onboarding redirect is handled by AuthNavigationGuard in _layout.tsx

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
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Hero */}
      <View style={[styles.hero, { paddingTop: insets.top + Spacing.md }]}>
        <TouchableOpacity style={styles.langBtn} onPress={() => setShowLangPicker(true)}>
          <Ionicons name="globe-outline" size={13} color="rgba(255,255,255,0.85)" />
          <Text style={styles.langBtnText}>{LANGUAGE_LABELS[language]}</Text>
          <Ionicons name="chevron-down" size={11} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🤝</Text>
          </View>
          <Text style={styles.brandName}>Haazir</Text>
          <Text style={styles.brandTagline}>Pakistan ka Agentic Home Services</Text>
        </View>
      </View>

      {/* White card — flex:1 ensures it always fills to the bottom */}
      <View style={styles.cardShell}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>{tr.welcome}</Text>
          <Text style={styles.sub}>{tr.loginSub}</Text>

          <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
            <Ionicons name="mail-outline" size={18} color={emailFocused ? Colors.primary : Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />
          </View>

          <View style={[styles.inputWrapper, passFocused && styles.inputWrapperFocused]}>
            <Ionicons name="lock-closed-outline" size={18} color={passFocused ? Colors.primary : Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              onFocus={() => setPassFocused(true)}
              onBlur={() => setPassFocused(false)}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, Shadow.primary]}
            onPress={handleLogin}
            disabled={busy || loading}
            activeOpacity={0.85}
          >
            {busy || loading ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={styles.btnText}>{tr.loginBtn}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ya</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/signup')} activeOpacity={0.75}>
            <Text style={styles.secondaryBtnText}>{tr.signupBtn}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Language Picker */}
      <Modal visible={showLangPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowLangPicker(false)} activeOpacity={1}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Zaban chunein</Text>
            {ALL_LANGS.map(([code, label]) => (
              <TouchableOpacity
                key={code}
                style={[styles.langOption, language === code && styles.langOptionActive]}
                onPress={() => { setLanguage(code); setShowLangPicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.langOptionText, language === code && styles.langOptionTextActive]}>{label}</Text>
                {language === code && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primary },

  hero: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl + 20,
  },
  langBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    marginBottom: Spacing.xl,
  },
  langBtnText: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.9)', fontWeight: FontWeight.semibold },
  logoContainer: { alignItems: 'center', paddingBottom: Spacing.md },
  logoCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.30)',
  },
  logoEmoji: { fontSize: 40 },
  brandName: { fontSize: 38, fontWeight: FontWeight.black, color: Colors.textInverse, letterSpacing: -0.5 },
  brandTagline: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)', marginTop: 4, textAlign: 'center' },

  cardShell: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    marginTop: -Spacing.xl,
    overflow: 'hidden',
  },
  scrollView: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.xl },
  heading: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.xl },

  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md, height: 54,
  },
  inputWrapperFocused: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  eyeBtn: { padding: 4 },

  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg, height: 54,
    alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  btnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: FontWeight.bold },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: FontSize.sm, marginHorizontal: Spacing.md },

  secondaryBtn: {
    height: 54, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.bold },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    padding: Spacing.xl,
    ...Shadow.modal,
  },
  modalHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.md },
  langOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.xs,
  },
  langOptionActive: { backgroundColor: Colors.primaryLight },
  langOptionText: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  langOptionTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },
});
