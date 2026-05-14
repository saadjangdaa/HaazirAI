import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Easing, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { submitRequest } from '../services/api';

const QUICK_SERVICES = [
  { label: 'AC Technician', icon: '❄️' },
  { label: 'Plumber', icon: '🔧' },
  { label: 'Electrician', icon: '⚡' },
  { label: 'Tutor', icon: '📚' },
  { label: 'Beautician', icon: '💄' },
  { label: 'Carpenter', icon: '🪚' },
  { label: 'Emergency', icon: '🚨', danger: true },
];

const RECENT_REQUESTS = [
  'AC gas refill G-13 kal subah',
  'Electrician DHA bijli fault',
  'Math tutor bachon ke liye',
];

export default function HomeScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentMsg, setAgentMsg] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [recording, setRecording] = useState(false);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, easing: Easing.ease, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
  };

  const handleVoice = () => {
    if (recording) {
      setRecording(false);
      stopPulse();
      setInput('AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye');
      setLocation('G-13, Islamabad');
    } else {
      setRecording(true);
      startPulse();
      Alert.alert('Voice Input', 'Bolein... (demo mode — simulated input)');
    }
  };

  const handleSubmit = async () => {
    const query = input.trim();
    if (!query) {
      Alert.alert('Kuch toh likhein!', 'Apni zaroorat batayein — Urdu ya English mein');
      return;
    }
    setLoading(true);
    const messages = [
      'Agents kaam par hain... 🤖',
      'SAMAJH: Aapki baat samajh raha hun...',
      'DHUNDHO: Providers dhoondh raha hun...',
      'CHUNNO: Best provider chunna ja raha hai...',
      'HISAAB: Price calculate ho raha hai...',
    ];
    let i = 0;
    const ticker = setInterval(() => {
      setAgentMsg(messages[i % messages.length]);
      i++;
    }, 1200);

    try {
      const result = await submitRequest(query, location || 'G-13, Islamabad', 'user_001');
      clearInterval(ticker);
      setLoading(false);
      setAgentMsg('');
      router.push({ pathname: '/results', params: { data: JSON.stringify(result) } });
    } catch (err: any) {
      clearInterval(ticker);
      setLoading(false);
      setAgentMsg('');
      Alert.alert('Error', err?.message || 'Kuch masla hua — dobara try karein');
    }
  };

  const handleQuickService = (label: string, danger?: boolean) => {
    if (danger) {
      setInput('EMERGENCY! Gas leak ho rahi hai, foran koi bhejein');
      setLocation('G-13, Islamabad');
    } else {
      setInput(`Mujhe ${label} chahiye`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.logo}>حاضر AI</Text>
        <Text style={styles.logoEn}>Haazir AI</Text>
        <Text style={styles.tagline}>Jo bhi chahiye, Haazir hai</Text>
      </View>

      <Animated.View style={[styles.voiceBtn, { transform: [{ scale: pulseAnim }] }, recording && styles.voiceBtnActive]}>
        <TouchableOpacity onPress={handleVoice} style={styles.voiceInner}>
          <Text style={styles.voiceIcon}>{recording ? '⏹' : '🎙'}</Text>
          <Text style={styles.voiceLabel}>{recording ? 'Rok Dein' : 'Bolen'}</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.inputCard}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Kya chahiye? (Urdu ya English mein likhein)"
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <TextInput
            style={styles.locationInput}
            value={location}
            onChangeText={setLocation}
            placeholder="Aapka area / mohalla (e.g. G-13, DHA)"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Jaldi Chunein:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        {QUICK_SERVICES.map((s) => (
          <TouchableOpacity
            key={s.label}
            style={[styles.chip, s.danger && styles.chipDanger]}
            onPress={() => handleQuickService(s.label, s.danger)}
          >
            <Text style={styles.chipIcon}>{s.icon}</Text>
            <Text style={[styles.chipText, s.danger && styles.chipTextDanger]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Pehle Ki Requests:</Text>
      {RECENT_REQUESTS.map((r, i) => (
        <TouchableOpacity key={i} style={styles.recentItem} onPress={() => setInput(r)}>
          <Text style={styles.recentIcon}>🕐</Text>
          <Text style={styles.recentText}>{r}</Text>
        </TouchableOpacity>
      ))}

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingMsg}>{agentMsg}</Text>
        </View>
      ) : (
        <TouchableOpacity style={[styles.submitBtn, Shadow.primary]} onPress={handleSubmit}>
          <Text style={styles.submitText}>Haazir Karo! 🚀</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logsLink} onPress={() => router.push('/logs')}>
        <Text style={styles.logsLinkText}>🔍 Agent Logs Dekhen (Judges)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  header: { alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.xl },
  logo: { fontSize: 36, color: Colors.primary, fontWeight: '900', textAlign: 'center' },
  logoEn: { fontSize: FontSize.xxl, color: Colors.textPrimary, fontWeight: '800' },
  tagline: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: 4 },
  voiceBtn: {
    alignSelf: 'center', width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.primaryDim, borderWidth: 2, borderColor: Colors.primary,
    marginBottom: Spacing.lg, justifyContent: 'center', alignItems: 'center',
    ...Shadow.primary,
  },
  voiceBtnActive: { backgroundColor: '#FF444422', borderColor: Colors.danger },
  voiceInner: { alignItems: 'center' },
  voiceIcon: { fontSize: 30 },
  voiceLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  inputCard: {
    backgroundColor: Colors.cardBg, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md,
  },
  textInput: {
    color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 72,
    fontFamily: 'System',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  locationIcon: { fontSize: 16, marginRight: 6 },
  locationInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm, marginTop: Spacing.sm },
  chipsScroll: { marginBottom: Spacing.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    marginRight: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  chipDanger: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  chipIcon: { fontSize: 14, marginRight: 4 },
  chipText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  chipTextDanger: { color: Colors.danger },
  recentItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBg,
    borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.xs,
    borderWidth: 1, borderColor: Colors.border,
  },
  recentIcon: { fontSize: 14, marginRight: 8 },
  recentText: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1 },
  loadingCard: {
    alignItems: 'center', backgroundColor: Colors.cardBg, borderRadius: Radius.lg,
    padding: Spacing.xl, marginTop: Spacing.lg, borderWidth: 1, borderColor: Colors.primary,
  },
  loadingMsg: { color: Colors.primary, fontSize: FontSize.md, marginTop: Spacing.md, fontWeight: '600', textAlign: 'center' },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md + 2,
    alignItems: 'center', marginTop: Spacing.lg,
  },
  submitText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
  logsLink: { alignItems: 'center', marginTop: Spacing.lg, padding: Spacing.sm },
  logsLinkText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
