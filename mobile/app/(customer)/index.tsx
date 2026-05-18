import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Easing, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { submitRequest, formatApiError, pingApi, getApiBaseUrl, requireUserId } from '../../services/api';
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

const CustomerHomeScreen = () => {
  const router = useRouter();
  const { user, ensureProfileSyncedBeforeRequest } = useAuth();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentMsg, setAgentMsg] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [recording, setRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    pingApi().then(({ ok }) => {
      if (mounted) setApiOk(ok);
    });
    return () => {
      mounted = false;
    };
  }, []);

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

  const handleVoice = async () => {
    if (voiceProcessing) return;

    if (recording) {
      setRecording(false);
      stopPulse();
      setVoiceProcessing(true);
      try {
        const { stopAndTranscribe } = await import('../../services/voiceRecord');
        const { text } = await stopAndTranscribe();
        if (text) setInput(text);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[home] voice error:', msg);
        if (msg.includes('Network') || msg.includes('rabta')) {
          Alert.alert('Voice / Network', msg);
        } else {
          setInput('AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye');
          setLocation('G-13, Islamabad');
          Alert.alert('Voice', msg || 'Transcribe fail — demo text set.');
        }
      } finally {
        setVoiceProcessing(false);
      }
    } else {
      try {
        const { requestMicPermission, startRecording } = await import('../../services/voiceRecord');
        const granted = await requestMicPermission();
        if (!granted) {
          Alert.alert('Permission Chahiye', 'Settings mein microphone access allow karein');
          return;
        }
        await startRecording();
        setRecording(true);
        startPulse();
      } catch {
        setInput('AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye');
        setLocation('G-13, Islamabad');
        Alert.alert('Voice', 'Recording unavailable in Expo Go — demo text set.');
      }
    }
  };

  const handleSubmit = async () => {
    const query = input.trim();
    if (!query) {
      Alert.alert('Kuch toh likhein!', 'Apni zaroorat batayein — Urdu ya English mein');
      return;
    }
    if (!user) {
      Alert.alert('Login zaroori hai', 'Pehle login karein phir Haazir button dabayein');
      return;
    }

    setLoading(true);
    const messages = [
      'Agents kaam par hain... 🤖',
      'Profile sync ho rahi hai...',
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
      const { ok } = await pingApi();
      if (!ok) {
        Alert.alert('Backend offline', formatApiError(new Error('Network Error')));
        return;
      }

      // Must finish /api/users/sync before /api/request (backend requires complete profile).
      const syncedUser = await ensureProfileSyncedBeforeRequest();

      if (!syncedUser.profileComplete) {
        Alert.alert(
          'Profile incomplete',
          'Booking se pehle username, mobile (03XXXXXXXXX) aur CNIC complete karein.',
          [{ text: 'Profile', onPress: () => router.push('/signup') }]
        );
        return;
      }

      const userId = requireUserId(syncedUser);
      const result = await submitRequest(query, location || 'G-13, Islamabad', userId);
      router.push({ pathname: '/results', params: { data: JSON.stringify(result) } });
    } catch (err: unknown) {
      Alert.alert('Error', formatApiError(err));
    } finally {
      clearInterval(ticker);
      setLoading(false);
      setAgentMsg('');
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
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md }]} keyboardShouldPersistTaps="handled">
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

      {apiOk === false && (
        <TouchableOpacity
          style={styles.apiBannerBad}
          onPress={() => pingApi().then(({ ok }) => setApiOk(ok))}
        >
          <Text style={styles.apiBannerText}>
            ⚠️ Backend offline — tap to retry. URL: {getApiBaseUrl()}
          </Text>
        </TouchableOpacity>
      )}
      {apiOk === true && __DEV__ && (
        <Text style={styles.apiBannerOk}>✓ Backend connected</Text>
      )}

      {/* Greeting */}
      <Text style={styles.greeting}>
        {user?.username ? `Assalam o Alaikum, ${user.username.split(' ')[0]}! 👋` : 'Assalam o Alaikum! 👋'}
      </Text>
      <Text style={styles.greetingSub}>Kya chahiye aaj?</Text>

      {/* Voice Button */}
      <View style={styles.voiceCenter}>
        <Animated.View style={[styles.voiceBtn, { transform: [{ scale: pulseAnim }] }, recording && styles.voiceBtnActive]}>
          <TouchableOpacity onPress={handleVoice} style={styles.voiceInner} disabled={voiceProcessing}>
            {voiceProcessing
              ? <ActivityIndicator color={Colors.background} size="small" />
              : <Text style={styles.voiceIcon}>{recording ? '⏹' : '🎙'}</Text>
            }
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.voiceLabel}>
          {voiceProcessing ? 'Samajh raha hun...' : recording ? 'Rok Dein' : 'Bolein ya likhein'}
        </Text>
      </View>

      {/* Talk to AI — full conversational mode */}
      <TouchableOpacity style={styles.talkBtn} onPress={() => router.push('/voice-conversation')}>
        <Text style={styles.talkBtnIcon}>🗣️</Text>
        <View style={styles.talkBtnText}>
          <Text style={styles.talkBtnTitle}>AI se Baat Karein</Text>
          <Text style={styles.talkBtnSub}>Voice conversation — agent khud poochega</Text>
        </View>
        <Text style={styles.talkBtnArrow}>→</Text>
      </TouchableOpacity>

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
};

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
  apiBannerBad: {
    backgroundColor: Colors.dangerDim,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  apiBannerOk: { fontSize: FontSize.xs, color: Colors.success, marginBottom: Spacing.sm },
  apiBannerText: { color: Colors.danger, fontSize: FontSize.xs, lineHeight: 18 },
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
  talkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primaryDim, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.primary,
    ...Shadow.primary,
  },
  talkBtnIcon: { fontSize: 28 },
  talkBtnText: { flex: 1 },
  talkBtnTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.primary },
  talkBtnSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  talkBtnArrow: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: '700' },
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

export default CustomerHomeScreen;
