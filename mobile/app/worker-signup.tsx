import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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

async function pickImage(label: string): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission chahiye', `${label} upload karne ke liye gallery access allow karein`);
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'] as ImagePicker.MediaType[],
    allowsEditing: true,
    quality: 0.7,
    aspect: [16, 9],
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

async function takePhoto(label: string): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission chahiye', `Camera access allow karein`);
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    quality: 0.7,
    aspect: [16, 9],
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

async function pickFile(label: string): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission chahiye', `Files access allow karein`);
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'] as ImagePicker.MediaType[],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

function PhotoPicker({
  label, uri, onPick,
}: {
  label: string;
  uri: string | null;
  onPick: (uri: string) => void;
}) {
  const handlePress = () => {
    Alert.alert(label, 'Kahan se upload karein?', [
      {
        text: '📷 Camera se Photo',
        onPress: async () => {
          const u = await takePhoto(label);
          if (u) onPick(u);
        },
      },
      {
        text: '🖼 Gallery se Upload',
        onPress: async () => {
          const u = await pickImage(label);
          if (u) onPick(u);
        },
      },
      {
        text: '📁 Files se Upload',
        onPress: async () => {
          const u = await pickFile(label);
          if (u) onPick(u);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <TouchableOpacity style={[styles.photoPicker, uri && styles.photoPickerDone]} onPress={handlePress}>
      {uri ? (
        <>
          <Image source={{ uri }} style={styles.photoPreview} resizeMode="cover" />
          <View style={styles.photoOverlay}>
            <Text style={styles.photoOverlayText}>✓ {label}</Text>
            <Text style={styles.photoChangeText}>Tap to change</Text>
          </View>
        </>
      ) : (
        <View style={styles.photoEmpty}>
          <Text style={styles.photoEmptyIcon}>📋</Text>
          <Text style={styles.photoEmptyLabel}>{label}</Text>
          <Text style={styles.photoEmptySub}>Camera / Gallery / Files</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

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
  const [cnicFront, setCnicFront] = useState<string | null>(null);
  const [cnicBack, setCnicBack] = useState<string | null>(null);
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
    if (!cnic.trim()) {
      Alert.alert('CNIC', 'CNIC number daalna zaroori hai');
      return;
    }
    if (!cnicFront) {
      Alert.alert('CNIC Front', 'CNIC front ki photo upload karein');
      return;
    }
    if (!cnicBack) {
      Alert.alert('CNIC Back', 'CNIC back ki photo upload karein');
      return;
    }

    setBusy(true);
    try {
      await completeWorkerSignup({
        specializations: selectedSpecs,
        areas: selectedCities,
        pricePerService: Number(price) || 500,
        experienceYears: Number(experience) || 1,
        cnic: normalizeCnic(cnic),
        phone: normalizePkPhone(phone),
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

      {/* CNIC Photos */}
      <Text style={styles.section}>CNIC Photos *</Text>
      <Text style={styles.sectionSub}>Identity verification ke liye zarori hai</Text>
      <View style={styles.photoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.photoLabel}>Front Side</Text>
          <PhotoPicker label="CNIC Front" uri={cnicFront} onPick={setCnicFront} />
        </View>
        <View style={{ width: Spacing.sm }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.photoLabel}>Back Side</Text>
          <PhotoPicker label="CNIC Back" uri={cnicBack} onPick={setCnicBack} />
        </View>
      </View>

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
          <Text style={styles.btnText}>✅ Register as Worker</Text>
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
  sectionSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
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
  // CNIC photos
  photoRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  photoLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  photoPicker: {
    height: 110, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border,
    borderStyle: 'dashed', overflow: 'hidden', backgroundColor: Colors.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  photoPickerDone: { borderStyle: 'solid', borderColor: Colors.primary },
  photoPreview: { width: '100%', height: '100%', position: 'absolute' },
  photoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', padding: 6, alignItems: 'center',
  },
  photoOverlayText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  photoChangeText: { color: '#ccc', fontSize: 10, marginTop: 1 },
  photoEmpty: { alignItems: 'center', gap: 4 },
  photoEmptyIcon: { fontSize: 28 },
  photoEmptyLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  photoEmptySub: { fontSize: 10, color: Colors.textMuted },
  // Trust card
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
