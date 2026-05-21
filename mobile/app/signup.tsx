import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { useAuth, UserRole, formatAuthBootstrapError } from '../context/AuthContext';
import { formatAuthError } from '../utils/authErrors';

const CITIES = ['Islamabad', 'Rawalpindi', 'Lahore', 'Karachi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta'];

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [cnic, setCnic] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Fields khali hain', 'Sab fields bharna zaroori hai');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password chota hai', 'Password kam az kam 6 characters ka hona chahiye');
      return;
    }
    setBusy(true);
    try {
      await signUp(email.trim(), password, name.trim(), role, cnic.trim() || undefined, city || undefined);
      if (role === 'worker') router.replace('/worker-signup');
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        Alert.alert(
          'Email pehle se registered hai',
          'Yeh email pehle se registered hai. Login karein ya doosra email use karein.',
          [
            { text: 'Login Karein', onPress: () => router.replace('/login') },
            { text: 'Theek Hai', style: 'cancel' },
          ]
        );
      } else {
        const msg = code?.startsWith('auth/') ? formatAuthError(e) : formatAuthBootstrapError(e);
        Alert.alert('Signup Error', msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.heading}>Account Banayein</Text>
        <Text style={styles.sub}>Haazir pe apna safar shuru karein</Text>

        {/* Role selector */}
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleCard, role === 'customer' && styles.roleCardActive]}
            onPress={() => setRole('customer')}
            activeOpacity={0.8}
          >
            <View style={[styles.roleIcon, role === 'customer' && styles.roleIconActive]}>
              <Ionicons name="home-outline" size={22} color={role === 'customer' ? Colors.primary : Colors.textMuted} />
            </View>
            <Text style={[styles.roleTitle, role === 'customer' && styles.roleTitleActive]}>Customer</Text>
            <Text style={styles.roleDesc}>Ghar ka kaam karwana hai</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, role === 'worker' && styles.roleCardWorker]}
            onPress={() => setRole('worker')}
            activeOpacity={0.8}
          >
            <View style={[styles.roleIcon, role === 'worker' && styles.roleIconWorker]}>
              <Ionicons name="construct-outline" size={22} color={role === 'worker' ? Colors.workerAccent : Colors.textMuted} />
            </View>
            <Text style={[styles.roleTitle, role === 'worker' && styles.roleTitleWorker]}>Worker</Text>
            <Text style={styles.roleDesc}>Kaam dhoondna hai</Text>
          </TouchableOpacity>
        </View>

        {role === 'worker' && (
          <View style={styles.workerNotice}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.workerAccent} />
            <Text style={styles.workerNoticeText}>
              Agle step mein skills aur details bhi bherni hongi
            </Text>
          </View>
        )}

        {/* Fields */}
        <Text style={styles.label}>Poora Naam</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Muhammad Ahmed"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />
        </View>

        <Text style={styles.label}>Email</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="aapka@email.com"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Kam az kam 6 characters"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {role === 'customer' && (
          <>
            <Text style={styles.label}>CNIC <Text style={styles.optional}>(optional)</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="card-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="12345-1234567-1"
                placeholderTextColor={Colors.textMuted}
                value={cnic}
                onChangeText={setCnic}
                keyboardType="numeric"
                maxLength={15}
              />
            </View>

            <Text style={styles.label}>Aapka Shehar</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.xs }} contentContainerStyle={{ gap: Spacing.xs, paddingVertical: 4 }}>
              {CITIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.cityChip, city === c && styles.cityChipActive]}
                  onPress={() => setCity(c)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cityChipText, city === c && styles.cityChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <TouchableOpacity
          style={[styles.btn, role === 'worker' && styles.btnWorker, Shadow.primary]}
          onPress={handleSignup}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.btnText}>
              {role === 'worker' ? 'Aage Barho' : 'Account Banayein'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginLink} onPress={() => router.replace('/login')}>
          <Text style={styles.loginLinkText}>Pehle se account hai? <Text style={styles.loginLinkAccent}>Login karein</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg },

  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.inputBg,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heading: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.xl },

  roleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  roleCard: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 6,
  },
  roleCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  roleCardWorker: { borderColor: Colors.workerAccent, backgroundColor: Colors.workerAccentDim },
  roleIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  roleIconActive: { backgroundColor: Colors.primaryDim },
  roleIconWorker: { backgroundColor: Colors.workerAccentDim },
  roleTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  roleTitleActive: { color: Colors.primary },
  roleTitleWorker: { color: Colors.workerAccent },
  roleDesc: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },

  workerNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.workerAccentDim,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  workerNoticeText: { color: Colors.workerAccent, fontSize: FontSize.xs, flex: 1 },

  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, marginBottom: 6, marginTop: Spacing.sm },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs, height: 54,
  },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  eyeBtn: { padding: 4 },

  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg, height: 54,
    alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  btnWorker: { backgroundColor: Colors.workerAccent },
  btnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: FontWeight.bold },

  loginLink: { marginTop: Spacing.lg, alignItems: 'center', paddingVertical: Spacing.sm },
  loginLinkText: { color: Colors.textMuted, fontSize: FontSize.sm },
  loginLinkAccent: { color: Colors.primary, fontWeight: FontWeight.bold },

  optional: { color: Colors.textMuted, fontWeight: FontWeight.regular as 'normal', fontSize: FontSize.xs },
  cityChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.inputBg,
  },
  cityChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  cityChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  cityChipTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },
});
