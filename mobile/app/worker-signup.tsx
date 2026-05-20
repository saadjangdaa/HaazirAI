import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { useAuth, formatAuthBootstrapError } from '../context/AuthContext';
import { formatCnicDisplay, normalizeCnic, normalizePkPhone } from '../utils/profileValidation';

const SPECIALIZATIONS = [
  { label: 'AC Repair', icon: 'snow-outline' as const },
  { label: 'Electrician', icon: 'flash-outline' as const },
  { label: 'Plumber', icon: 'water-outline' as const },
  { label: 'Carpenter', icon: 'hammer-outline' as const },
  { label: 'Painter', icon: 'color-palette-outline' as const },
  { label: 'CCTV/Security', icon: 'camera-outline' as const },
  { label: 'Tutor', icon: 'book-outline' as const },
  { label: 'Beautician', icon: 'sparkles-outline' as const },
  { label: 'Welder', icon: 'settings-outline' as const },
  { label: 'Cleaner', icon: 'leaf-outline' as const },
];

const CITIES = ['Islamabad', 'Rawalpindi', 'Lahore', 'Karachi', 'Peshawar', 'Multan', 'Faisalabad'];

export default function WorkerSignupScreen() {
  const router = useRouter();
  const { completeWorkerSignup } = useAuth();
  const insets = useSafeAreaInsets();

  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [price, setPrice] = useState('');
  const [experience, setExperience] = useState('');
  const [cnic, setCnic] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleSpec = (s: string) =>
    setSelectedSpecs((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const toggleCity = (c: string) =>
    setSelectedCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const handleCnicChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 13);
    setCnic(formatCnicDisplay(digits));
  };

  const handleRegister = async () => {
    if (selectedSpecs.length === 0) { Alert.alert('Specialization chunein', 'Kam az kam ek skill select karein'); return; }
    if (selectedCities.length === 0) { Alert.alert('City chunein', 'Kahan kaam karte hain?'); return; }
    if (!phone.trim()) { Alert.alert('Phone number', 'Mobile number daalna zaroori hai'); return; }

    let normalizedPhone: string;
    try { normalizedPhone = normalizePkPhone(phone); }
    catch (e) { Alert.alert('Phone Format', (e as Error).message + '\nMisaal: 03001234567'); return; }

    if (!cnic.trim()) { Alert.alert('CNIC', 'CNIC number daalna zaroori hai'); return; }

    let normalizedCnic: string;
    try { normalizedCnic = normalizeCnic(cnic); }
    catch (e) { Alert.alert('CNIC Format', (e as Error).message); return; }

    setBusy(true);
    try {
      await completeWorkerSignup({
        specializations: selectedSpecs,
        areas: selectedCities,
        pricePerService: Number(price) || 500,
        experienceYears: Number(experience) || 1,
        cnic: normalizedCnic,
        phone: normalizedPhone,
        availability: true,
        rating: 0,
      });
      router.replace('/(worker)/jobs');
    } catch (e) {
      Alert.alert('Registration failed', formatAuthBootstrapError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>Step 2 of 2</Text>
        </View>
        <Text style={styles.heading}>Worker Profile</Text>
        <Text style={styles.sub}>Skills, areas, aur verification details</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: '100%' }]} />
      </View>

      {/* Skills */}
      <Text style={styles.section}>Aapki Skills</Text>
      <View style={styles.chipGrid}>
        {SPECIALIZATIONS.map(({ label, icon }) => {
          const on = selectedSpecs.includes(label);
          return (
            <TouchableOpacity key={label} style={[styles.chip, on && styles.chipActive]} onPress={() => toggleSpec(label)} activeOpacity={0.75}>
              <Ionicons name={icon} size={15} color={on ? Colors.workerAccent : Colors.textMuted} />
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Cities */}
      <Text style={styles.section}>Kahan Kaam Karte Hain?</Text>
      <View style={styles.chipGrid}>
        {CITIES.map((c) => {
          const on = selectedCities.includes(c);
          return (
            <TouchableOpacity key={c} style={[styles.chip, on && styles.chipActive]} onPress={() => toggleCity(c)} activeOpacity={0.75}>
              <Ionicons name="location-outline" size={13} color={on ? Colors.workerAccent : Colors.textMuted} />
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Phone */}
      <Text style={styles.label}>Mobile Number</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="call-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="03001234567"
          placeholderTextColor={Colors.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={15}
        />
      </View>

      <Text style={styles.label}>CNIC Number</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="card-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="12345-1234567-1"
          placeholderTextColor={Colors.textMuted}
          value={cnic}
          onChangeText={handleCnicChange}
          keyboardType="number-pad"
          maxLength={15}
        />
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Average Price (Rs)</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="cash-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="500"
              placeholderTextColor={Colors.textMuted}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />
          </View>
        </View>
        <View style={{ width: Spacing.sm }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Experience (Saal)</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="time-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="3"
              placeholderTextColor={Colors.textMuted}
              value={experience}
              onChangeText={setExperience}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      {/* Trust card */}
      <View style={styles.trustCard}>
        <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.trustTitle}>Background Verification</Text>
          <Text style={styles.trustText}>
            Haazir AI saare workers ka CNIC aur skill verification karta hai — verified workers ko zyada kaam milta hai.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.btn, Shadow.primary]} onPress={handleRegister} disabled={busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color={Colors.textInverse} /> : <Text style={styles.btnText}>Worker Ke Tor Pe Register Karein</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  content: { paddingHorizontal: Spacing.lg },

  header: { marginBottom: Spacing.md },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.workerAccentDim,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 5,
    marginBottom: Spacing.sm,
  },
  stepBadgeText: { color: Colors.workerAccent, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  heading: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted },

  progressBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginBottom: Spacing.xl },
  progressFill: { height: 4, backgroundColor: Colors.workerAccent, borderRadius: 2 },

  section: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.sm, marginTop: Spacing.sm },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.inputBg, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  chipActive: { backgroundColor: Colors.workerAccentDim, borderColor: Colors.workerAccent },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  chipTextActive: { color: Colors.workerAccent },

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
  row: { flexDirection: 'row' },

  trustCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg, padding: Spacing.md,
    marginVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  trustTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: 4 },
  trustText: { fontSize: FontSize.xs, color: Colors.primary, lineHeight: 18 },

  btn: {
    backgroundColor: Colors.workerAccent,
    borderRadius: Radius.lg, height: 54,
    alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  btnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
