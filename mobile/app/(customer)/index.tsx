import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Easing, Alert, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../../constants/theme';
import { submitRequest, formatApiError, pingApi, getApiBaseUrl, requireUserId, getUserBookings } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { useMockData } from '../../context/MockDataContext';
import { MOCK_RECENT_REQUESTS } from '../../data/mockData';

const QUICK_SERVICES = [
  { label: 'AC Repair', icon: 'snow-outline' as const },
  { label: 'Plumber', icon: 'water-outline' as const },
  { label: 'Electrician', icon: 'flash-outline' as const },
  { label: 'Tutor', icon: 'book-outline' as const },
  { label: 'Beautician', icon: 'sparkles-outline' as const },
  { label: 'Carpenter', icon: 'hammer-outline' as const },
  { label: 'Emergency', icon: 'warning-outline' as const, danger: true },
];

const CustomerHomeScreen = () => {
  const router = useRouter();
  const { user, ensureProfileSyncedBeforeRequest } = useAuth();
  const { tr } = useLang();
  const { isMockMode } = useMockData();
  const insets = useSafeAreaInsets();

  const [input, setInput] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentMsg, setAgentMsg] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [recording, setRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [apiWakingUp, setApiWakingUp] = useState(false);
  const [recentRequests, setRecentRequests] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout>;

    const check = async () => {
      const { ok } = await pingApi();
      if (!mounted) return;
      setApiOk(ok);
      if (!ok) {
        // Render free tier cold start can take 30+ seconds — auto-retry once
        setApiWakingUp(true);
        retryTimer = setTimeout(async () => {
          const { ok: ok2 } = await pingApi();
          if (mounted) { setApiOk(ok2); setApiWakingUp(false); }
        }, 20000);
      }
    };

    check();
    return () => { mounted = false; clearTimeout(retryTimer); };
  }, []);

  useEffect(() => {
    if (isMockMode) {
      setRecentRequests(MOCK_RECENT_REQUESTS);
      return;
    }
    if (!user?.id) return;
    let cancelled = false;
    try {
      const uid = requireUserId(user);
      getUserBookings(uid).then((bookings) => {
        if (cancelled) return;
        const names = bookings
          .slice()
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .slice(0, 3)
          .map((b) => b.service || '')
          .filter(Boolean);
        setRecentRequests(names);
      }).catch(() => {});
    } catch {}
    return () => { cancelled = true; };
  }, [user?.id, isMockMode]);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, easing: Easing.ease, useNativeDriver: true }),
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
        if (msg.includes('Network') || msg.includes('rabta')) {
          Alert.alert('Voice / Network', msg);
        } else {
          setInput('AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye');
          setLocation('G-13, Islamabad');
        }
      } finally {
        setVoiceProcessing(false);
      }
    } else {
      try {
        const { requestMicPermission, startRecording } = await import('../../services/voiceRecord');
        const granted = await requestMicPermission();
        if (!granted) { Alert.alert('Permission Chahiye', 'Settings mein microphone access allow karein'); return; }
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
    if (!query) { Alert.alert('Kuch toh likhein!', 'Apni zaroorat batayein — Urdu ya English mein'); return; }
    if (!user) { Alert.alert('Login zaroori hai', 'Pehle login karein phir try karein'); return; }

    setLoading(true);
    const messages = [
      'Agents kaam par hain...',
      'SAMAJH: Aapki baat samajh raha hun...',
      'DHUNDHO: Providers dhoondh raha hun...',
      'CHUNNO: Best match chunna ja raha hai...',
      'HISAAB: Price calculate ho raha hai...',
    ];
    let i = 0;
    const ticker = setInterval(() => { setAgentMsg(messages[i % messages.length]); i++; }, 1200);

    try {
      const { ok } = await pingApi();
      if (!ok) { Alert.alert('Backend offline', formatApiError(new Error('Network Error'))); return; }

      const syncedUser = await ensureProfileSyncedBeforeRequest();
      if (!syncedUser.profileComplete) {
        Alert.alert(
          'Profile incomplete',
          syncedUser.role === 'worker'
            ? 'Booking se pehle username, mobile aur CNIC complete karein.'
            : 'Pehle apna naam profile mein complete karein.',
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
      const area = location.trim() || 'G-13, Islamabad';
      setInput(`Mujhe ${label} chahiye — ${area}`);
      if (!location.trim()) setLocation(area);
    }
  };

  const firstName = user?.username?.split(' ')[0] || user?.name?.split(' ')[0] || '';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Blue header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{firstName ? `Assalam o Alaikum, ${firstName}!` : 'Assalam o Alaikum!'}</Text>
            <Text style={styles.greetingSub}>Aaj kya chahiye?</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/logs')}>
              <Ionicons name="notifications-outline" size={22} color={Colors.textInverse} />
              <View style={styles.notifDot} />
            </TouchableOpacity>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={18} color={Colors.primary} />
            </View>
          </View>
        </View>

        {/* Search bar in header */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Kya chahiye? (Urdu ya English)"
            placeholderTextColor={Colors.textMuted}
            value={input}
            onChangeText={setInput}
            returnKeyType="search"
            onSubmitEditing={handleSubmit}
          />
          {input.length > 0 && (
            <TouchableOpacity onPress={() => setInput('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {apiOk === false && (
          <TouchableOpacity
            style={[styles.apiBannerBad, apiWakingUp && styles.apiBannerWaking]}
            onPress={() => { setApiWakingUp(false); pingApi().then(({ ok }) => setApiOk(ok)); }}
          >
            <Ionicons name={apiWakingUp ? 'hourglass-outline' : 'warning-outline'} size={14} color={apiWakingUp ? Colors.warning : Colors.danger} />
            <Text style={[styles.apiBannerText, apiWakingUp && { color: Colors.warning }]}>
              {apiWakingUp
                ? 'Server waking up (Render cold start)... retry in ~20s'
                : 'Backend offline — tap to retry'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Voice button section */}
        <View style={styles.voiceSection}>
          <Animated.View style={[styles.voiceBtnOuter, { transform: [{ scale: pulseAnim }] }, recording && styles.voiceBtnOuterActive]}>
            <TouchableOpacity style={[styles.voiceBtn, recording && styles.voiceBtnActive]} onPress={handleVoice} disabled={voiceProcessing} activeOpacity={0.85}>
              {voiceProcessing
                ? <ActivityIndicator color={Colors.textInverse} size="small" />
                : <Ionicons name={recording ? 'stop' : 'mic'} size={32} color={Colors.textInverse} />
              }
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.voiceLabel}>
            {voiceProcessing ? 'Samajh raha hun...' : recording ? 'Rokein' : 'Bolein ya likhein'}
          </Text>
          <TouchableOpacity style={styles.talkBtn} onPress={() => router.push('/voice-conversation')} activeOpacity={0.8}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} />
            <Text style={styles.talkBtnText}>{tr.talkToAI}</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Location row */}
        <View style={styles.locationCard}>
          <Ionicons name="location" size={16} color={Colors.primary} />
          <TextInput
            style={styles.locationInput}
            value={location}
            onChangeText={setLocation}
            placeholder="Aapka area (e.g. G-13, DHA)"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Quick services */}
        <Text style={styles.sectionLabel}>Services</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={{ paddingRight: Spacing.md }}>
          {QUICK_SERVICES.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={[styles.serviceChip, s.danger && styles.serviceChipDanger]}
              onPress={() => handleQuickService(s.label, s.danger)}
              activeOpacity={0.8}
            >
              <View style={[styles.serviceChipIcon, s.danger && styles.serviceChipIconDanger]}>
                <Ionicons name={s.icon} size={20} color={s.danger ? Colors.danger : Colors.primary} />
              </View>
              <Text style={[styles.serviceChipText, s.danger && styles.serviceChipTextDanger]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Agent info card */}
        <View style={[styles.agentCard, Shadow.sm]}>
          <View style={styles.agentCardLeft}>
            <View style={styles.agentIconBox}>
              <Ionicons name="hardware-chip-outline" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.agentCardTitle}>4 AI Agents Active</Text>
              <Text style={styles.agentCardText}>SAMAJH · DHUNDHO · CHUNNO · HISAAB milkar aapka best provider chunte hain</Text>
            </View>
          </View>
        </View>

        {/* Recent requests */}
        {recentRequests.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Recent</Text>
            {recentRequests.map((r, i) => (
              <TouchableOpacity key={i} style={[styles.recentItem, Shadow.sm]} onPress={() => setInput(r)} activeOpacity={0.75}>
                <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.recentText} numberOfLines={1}>{r}</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Submit */}
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingMsg}>{agentMsg}</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.submitBtn, Shadow.primary]} onPress={handleSubmit} activeOpacity={0.85}>
            <Ionicons name="search" size={18} color={Colors.textInverse} style={{ marginRight: 8 }} />
            <Text style={styles.submitText}>Haazir Karo!</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logsLink} onPress={() => router.push('/logs')}>
          <Ionicons name="flask-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.logsLinkText}>Agent Logs (Judges)</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Blue header
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  greeting: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse },
  greetingSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  notifBtn: { position: 'relative', padding: 4 },
  notifDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger, borderWidth: 1.5, borderColor: Colors.primary },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.textInverse, justifyContent: 'center', alignItems: 'center' },

  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, height: 48,
    ...Shadow.card,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },

  // Body
  body: { flex: 1 },
  bodyContent: { padding: Spacing.md, paddingBottom: 32 },

  apiBannerBad: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dangerDim,
    borderRadius: Radius.md, padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.danger,
  },
  apiBannerWaking: { backgroundColor: Colors.warningDim, borderColor: Colors.warning },
  apiBannerText: { color: Colors.danger, fontSize: FontSize.xs, flex: 1 },

  // Voice section
  voiceSection: { alignItems: 'center', paddingVertical: Spacing.lg },
  voiceBtnOuter: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.primaryDim,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  voiceBtnOuterActive: { backgroundColor: 'rgba(255,59,48,0.12)' },
  voiceBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.primary,
  },
  voiceBtnActive: { backgroundColor: Colors.danger },
  voiceLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, marginBottom: Spacing.md },
  talkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  talkBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.bold },

  // Location
  locationCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, height: 48,
    marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  locationInput: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },

  // Service chips
  chipsScroll: { marginBottom: Spacing.lg, marginLeft: -Spacing.md },
  serviceChip: {
    alignItems: 'center', gap: 6,
    marginLeft: Spacing.md,
    width: 72,
  },
  serviceChipDanger: {},
  serviceChipIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.sm,
  },
  serviceChipIconDanger: { backgroundColor: Colors.dangerDim },
  serviceChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold, textAlign: 'center' },
  serviceChipTextDanger: { color: Colors.danger },

  // Agent card
  agentCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  agentCardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  agentIconBox: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  agentCardTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: 2 },
  agentCardText: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16 },

  // Recent
  recentItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.xs,
    borderWidth: 1, borderColor: Colors.border,
  },
  recentText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm },

  // Loading
  loadingCard: {
    alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.xl, padding: Spacing.xl,
    marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.primaryDim,
    ...Shadow.sm,
  },
  loadingMsg: { color: Colors.primary, fontSize: FontSize.sm, marginTop: Spacing.md, fontWeight: FontWeight.semibold, textAlign: 'center' },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    height: 56, marginTop: Spacing.md,
  },
  submitText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  logsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: Spacing.lg, padding: Spacing.sm },
  logsLinkText: { color: Colors.textMuted, fontSize: FontSize.xs },
});

export default CustomerHomeScreen;
