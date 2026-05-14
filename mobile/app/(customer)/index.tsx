import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Easing, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { submitRequest } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

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

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}><Text style={styles.headerIconText}>🤖</Text></View>
          <View>
            <Text style={styles.headerTitle}>Haazir AI</Text>
            <Text style={styles.headerSub}>Pakistan's AI service agent</Text>
          </View>
        </View>
        <View style={styles.notifBtn}>
          <Text style={styles.notifIcon}>🔔</Text>
          <View style={styles.notifDot} />
        </View>
      </View>

      {/* Greeting */}
      <Text style={styles.greeting}>
        {user?.name ? `Assalam o Alaikum, ${user.name.split(' ')[0]}! 👋` : 'Assalam o Alaikum! 👋'}
      </Text>
      <Text style={styles.greetingSub}>Kya chahiye aaj?</Text>

      {/* Voice Button */}
      <View style={styles.voiceCenter}>
        <Animated.View style={[styles.voiceBtn, { transform: [{ scale: pulseAnim }] }, recording && styles.voiceBtnActive]}>
          <TouchableOpacity onPress={handleVoice} style={styles.voiceInner}>
            <Text style={styles.voiceIcon}>{recording ? '⏹' : '🎙'}</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.voiceLabel}>{recording ? 'Rok Dein' : 'Bolein ya likhein'}</Text>
      </View>

      {/* Input Card */}
      <View style={[styles.inputCard, Shadow.card]}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="e.g. AC bilkul kaam nahi kar raha, kal subah chahiye..."
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <View style={styles.inputBottom}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>📍</Text>
            <TextInput
              style={styles.locationInput}
              value={location}
              onChangeText={setLocation}
              placeholder="Aapka area (e.g. G-13, DHA)"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <TouchableOpacity style={styles.sendBtn} onPress={handleSubmit} disabled={loading}>
            <Text style={styles.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Services */}
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

      {/* Agent Info Card */}
      <View style={[styles.agentCard, Shadow.card]}>
        <Text style={styles.agentCardTitle}>✨ Haazir hai!</Text>
        <Text style={styles.agentCardText}>
          4 AI agents — SAMAJH, DHUNDHO, CHUNNO, PAKKA — milkar aapka best provider chunte hain. Fikr mat karo. ✨
        </Text>
      </View>

      {/* Recent Requests */}
      <Text style={styles.sectionLabel}>Pehle Ki Requests:</Text>
      {RECENT_REQUESTS.map((r, i) => (
        <TouchableOpacity key={i} style={[styles.recentItem, Shadow.card]} onPress={() => setInput(r)}>
          <Text style={styles.recentIcon}>🕐</Text>
          <Text style={styles.recentText}>{r}</Text>
        </TouchableOpacity>
      ))}

      {/* Loading / Submit */}
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
  content: { padding: Spacing.md, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIcon: { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.surfaceElevated, justifyContent: 'center', alignItems: 'center' },
  headerIconText: { fontSize: 20 },
  headerTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  notifBtn: { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.surfaceElevated, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  notifIcon: { fontSize: 16 },
  notifDot: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary },
  greeting: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  greetingSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.lg },
  voiceCenter: { alignItems: 'center', marginBottom: Spacing.lg },
  voiceBtn: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.primary,
  },
  voiceBtnActive: { backgroundColor: Colors.danger },
  voiceInner: { justifyContent: 'center', alignItems: 'center' },
  voiceIcon: { fontSize: 34, color: Colors.background },
  voiceLabel: { marginTop: Spacing.sm, fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  inputCard: {
    backgroundColor: Colors.cardBg, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md,
  },
  textInput: {
    color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 60,
  },
  inputBottom: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  locationRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  locationIcon: { fontSize: 14, marginRight: 6 },
  locationInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginLeft: Spacing.sm },
  sendBtnText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.sm },
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
  agentCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryDim, padding: Spacing.md, marginBottom: Spacing.md },
  agentCardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  agentCardText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
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
    backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.md + 2,
    alignItems: 'center', marginTop: Spacing.lg,
  },
  submitText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
  logsLink: { alignItems: 'center', marginTop: Spacing.lg, padding: Spacing.sm },
  logsLinkText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
