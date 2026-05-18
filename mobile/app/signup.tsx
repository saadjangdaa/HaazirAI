import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuth, UserRole, formatAuthBootstrapError } from '../context/AuthContext';
import { formatAuthError } from '../utils/authErrors';

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [busy, setBusy] = useState(false);

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
      await signUp(email.trim(), password, name.trim(), role);
      if (role === 'worker') {
        router.replace('/worker-signup');
      } else {
        router.replace('/');
      }
    } catch (e) {
      const msg =
        (e as { code?: string })?.code?.startsWith('auth/')
          ? formatAuthError(e)
          : formatAuthBootstrapError(e);
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Account Banayein</Text>
        <Text style={styles.sub}>Haazir AI pe apna safar shuru karein</Text>

        <Text style={styles.label}>Aap kaun hain?</Text>
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleCard, role === 'customer' && styles.roleCardActive]}
            onPress={() => setRole('customer')}
          >
            <Text style={styles.roleEmoji}>🏠</Text>
            <Text style={[styles.roleTitle, role === 'customer' && styles.roleTitleActive]}>
              Customer
            </Text>
            <Text style={styles.roleDesc}>Ghar ka kaam karwana hai</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleCard, role === 'worker' && styles.roleCardWorker]}
            onPress={() => setRole('worker')}
          >
            <Text style={styles.roleEmoji}>🔧</Text>
            <Text style={[styles.roleTitle, role === 'worker' && styles.roleTitleWorker]}>
              Worker
            </Text>
            <Text style={styles.roleDesc}>Kaam dhoondna hai, kamai karni hai</Text>
          </TouchableOpacity>
        </View>

        {role === 'worker' && (
          <View style={styles.workerNotice}>
            <Text style={styles.workerNoticeText}>
              Worker ke liye agle step mein aapki skills aur details bhi bherni hongi
            </Text>
          </View>
        )}

        <Text style={styles.label}>Poora Naam</Text>
        <TextInput
          style={styles.input}
          placeholder="Muhammad Ahmed"
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={setName}
          autoComplete="name"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="aapka@email.com"
          placeholderTextColor={Colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="kam az kam 6 characters"
          placeholderTextColor={Colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.btn, role === 'worker' && styles.btnWorker, Shadow.primary]}
          onPress={handleSignup}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.btnText}>
              {role === 'worker' ? 'Aage Barho →' : 'Account Banayein'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginLink} onPress={() => router.replace('/login')}>
          <Text style={styles.loginLinkText}>Pehle se account hai? Login karein</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: Spacing.lg, paddingBottom: Spacing.xxl },
  heading: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
    marginTop: Spacing.md,
  },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.lg },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  roleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  roleCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  roleCardActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceElevated },
  roleCardWorker: { borderColor: Colors.warning, backgroundColor: '#FFFBEB' },
  roleEmoji: { fontSize: 28, marginBottom: 6 },
  roleTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textSecondary },
  roleTitleActive: { color: Colors.primary },
  roleTitleWorker: { color: Colors.warning },
  roleDesc: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  workerNotice: {
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.warning + '66',
  },
  workerNoticeText: { color: Colors.warning, fontSize: FontSize.xs, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  btnWorker: { backgroundColor: Colors.warning },
  btnText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '800' },
  loginLink: { marginTop: Spacing.lg, alignItems: 'center' },
  loginLinkText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
});
