import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuth, formatAuthBootstrapError } from '../context/AuthContext';
import { formatCnicDisplay, normalizeCnic, normalizePkPhone } from '../utils/profileValidation';

const SPECIALIZATIONS = [
  { label: 'AC Repair', icon: '❄️' },
  { label: 'Electrician', icon: '⚡' },
  { label: 'Plumber', icon: '🔧' },
  { label: 'Carpenter', icon: '🪚' },
  { label: 'Painter', icon: '🎨' },
  { label: 'CCTV/Security', icon: '📷' },
  { label: 'Tutor', icon: '📚' },
  { label: 'Beautician', icon: '💄' },
  { label: 'Welder', icon: '🔩' },
  { label: 'Cleaner', icon: '🧹' },
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
    if (selectedSpecs.length === 0) {
      Alert.alert('Specialization chunein', 'Kam az kam ek skill select karein');
      return;
    }
    if (selectedCities.length === 0) {
      Alert.alert('City chunein', 'Kahan kaam karte hain?');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Phone number', 'Mobile number daalna zaroori hai');
      return;
    }
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePkPhone(phone);
    } catch (e) {
      Alert.alert('Phone Format', (e as Error).message + '\nMisaal: 03001234567');
      return;
    }
    if (!cnic.trim()) {
      Alert.alert('CNIC', 'CNIC number daalna zaroori hai');
      return;
    }
    let normalizedCnic: string;
    try {
      normalizedCnic = normalizeCnic(cnic);
    } catch (e) {
      Alert.alert('CNIC Format', (e as Error).message);
      return;
    }

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
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
    >
      <Text style={styles.heading}>Worker Registration</Text>
      <Text style={styles.sub}>Step 2 — skills, areas, aur verification</Text>

      {/* Skills */}
      <Text style={styles.section}>Aapki Skills *</Text>
      <View style={styles.chipGrid}>
        {SPECIALIZATIONS.map(({ label, icon }) => {
          const on = selectedSpecs.includes(label);
          return (
            <TouchableOpacity
              key={label}
              style={[styles.chip, on && styles.chipActive]}
              onPress={() => toggleSpec(label)}
            >
              <Text style={styles.chipIcon}>{icon}</Text>
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Cities */}
      <Text style={styles.section}>Kahan Kaam Karte Hain? *</Text>
      <View style={styles.chipGrid}>
        {CITIES.map((c) => {
          const on = selectedCities.includes(c);
          return (
            <TouchableOpacity
              key={c}
              style={[styles.chip, on && styles.chipActive]}
              onPress={() => toggleCity(c)}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]}>📍 {c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Phone */}
      <Text style={styles.label}>Mobile Number *</Text>
      <TextInput
        style={styles.input}
        placeholder="03001234567"
        placeholderTextColor={Colors.textMuted}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={15}
      />

      {/* CNIC number */}
      <Text style={styles.label}>CNIC Number *</Text>
      <TextInput
        style={styles.input}
        placeholder="12345-1234567-1"
        placeholderTextColor={Colors.textMuted}
        value={cnic}
        onChangeText={handleCnicChange}
        keyboardType="number-pad"
        maxLength={15}
      />

      {/* Experience + Price */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Average Price (Rs)</Text>
          <TextInput
            style={styles.input}
            placeholder="500"
            placeholderTextColor={Colors.textMuted}
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />
        </View>
        <View style={{ width: Spacing.md }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Experience (Saal)</Text>
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

      {/* Trust card */}
      <View style={styles.trustCard}>
        <Text style={styles.trustTitle}>🛡️ Background Verification</Text>
        <Text style={styles.trustText}>
          Haazir AI saare workers ka CNIC aur skill verification karta hai —
          verified workers ko zyada kaam milta hai aur higher rating milti hai.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, Shadow.primary]}
        onPress={handleRegister}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.btnText}>Register as Worker</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  heading: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.lg },
  section: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4, marginTop: Spacing.md },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  chipActive: { backgroundColor: '#FFFBEB', borderColor: Colors.warning },
  chipIcon: { fontSize: 14 },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: Colors.warning },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: Spacing.sm },
  input: {
    backgroundColor: Colors.inputBg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, fontSize: FontSize.md, color: Colors.textPrimary,
  },
  row: { flexDirection: 'row', marginTop: Spacing.sm },
  trustCard: {
    backgroundColor: '#E0F2FE', borderRadius: Radius.lg, padding: Spacing.md,
    marginVertical: Spacing.md, borderWidth: 1, borderColor: '#0284C733',
  },
  trustTitle: { fontSize: FontSize.sm, fontWeight: '700', color: '#0369A1', marginBottom: 4 },
  trustText: { fontSize: FontSize.xs, color: '#0369A1', lineHeight: 18 },
  btn: {
    backgroundColor: Colors.warning, borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', marginTop: Spacing.sm,
  },
  btnText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '800' },
});
