import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { requestMicPermission, startRecording, stopAndTranscribe } from '../services/voiceRecord';
import { playBase64Audio, stopSpeaking } from '../services/voicePlayback';
import { startConversation, sendMessage, ConversationTurn, ConversationPhase, BookingResult } from '../services/conversationApi';
import ProviderCard from '../components/ProviderCard';

type Message = { id: string; role: 'user' | 'agent'; text: string };

let _msgCounter = 0;
function newMsg(role: Message['role'], text: string): Message {
  return { id: `${role}-${++_msgCounter}`, role, text };
}
type UIState = 'greeting' | 'idle' | 'recording' | 'processing' | 'speaking' | 'searching' | 'done';

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const PHASE_LABEL: Record<ConversationPhase, string> = {
  intake: 'Baat kar rahe hain...',
  searching: 'Providers dhoondh rahe hain...',
  confirming: 'Provider chunein...',
  booking: 'Booking ho rahi hai...',
  done: 'Shukriya!',
};

export default function VoiceConversationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sessionId = useRef(generateSessionId());
  const userName = user?.name || '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [uiState, setUiState] = useState<UIState>('greeting');
  const [phase, setPhase] = useState<ConversationPhase>('intake');
  const [providers, setProviders] = useState<any[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  // ── Pulse animation ────────────────────────────────────────────────────────
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 500, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, easing: Easing.ease, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1.0, duration: 150, useNativeDriver: true }).start();
  }, [pulseAnim]);

  // ── Play agent audio & update state ───────────────────────────────────────
  const playAgentTurn = useCallback((turn: ConversationTurn) => {
    setPhase(turn.phase);
    // Always add agent message — even empty text gets a placeholder so chat stays continuous
    const agentText = turn.response_text?.trim() || '...';
    setMessages((prev) => [...prev, newMsg('agent', agentText)]);
    if (turn.providers?.length) {
      setProviders(turn.providers);
    }
    if (turn.request_id) {
      setRequestId(turn.request_id);
    }
    if (turn.booking_result) {
      setBookingResult(turn.booking_result);
    }

    if (turn.audio_base64) {
      setUiState('speaking');
      startPulse();
      playBase64Audio(turn.audio_base64, () => {
        stopPulse();
        setUiState(turn.phase === 'done' ? 'done' : 'idle');
      });
    } else {
      setUiState(turn.phase === 'done' ? 'done' : 'idle');
    }
  }, [startPulse, stopPulse]);

  // ── Initial greeting on mount ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const turn = await startConversation(sessionId.current, 'user_001', userName);
        if (!cancelled) playAgentTurn(turn);
      } catch (e) {
        if (!cancelled) {
          console.error('[conv] greeting failed:', e);
          setMessages([newMsg('agent', 'Haazir AI mein khush amdeed! Kya chahiye?')]);
          setUiState('idle');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-scroll on new message ────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // ── Mic button handler ────────────────────────────────────────────────────
  const handleMic = async () => {
    if (uiState === 'recording') {
      // Stop recording → transcribe → send
      setUiState('processing');
      stopPulse();
      try {
        const { text } = await stopAndTranscribe();
        if (!text) { setUiState('idle'); return; }
        setMessages((prev) => [...prev, newMsg('user', text)]);
        setUiState('searching');
        const turn = await sendMessage(sessionId.current, text, 'user_001', userName);
        playAgentTurn(turn);
      } catch (e: any) {
        console.error('[conv] send error:', e);
        Alert.alert('Error', e?.message || 'Masla hua — dobara try karein');
        setUiState('idle');
      }
    } else if (uiState === 'idle') {
      // Start recording
      const granted = await requestMicPermission();
      if (!granted) {
        Alert.alert('Permission Chahiye', 'Microphone access allow karein settings mein');
        return;
      }
      try {
        await stopSpeaking();
        await startRecording();
        setUiState('recording');
        startPulse();
      } catch (e) {
        Alert.alert('Error', 'Recording shuru nahi ho saki');
      }
    } else if (uiState === 'speaking') {
      // Interrupt agent
      await stopSpeaking();
      stopPulse();
      setUiState('idle');
    }
  };

  // ── Provider select from card (visual) ────────────────────────────────────
  const handleSelectProvider = (provider: any) => {
    router.replace({
      pathname: '/booking',
      params: {
        providerData: JSON.stringify(provider),
        priceData: JSON.stringify({ total: provider.base_rate || 2500 }),
        requestId: requestId || '',
      },
    });
  };

  // ── Mic icon & colour based on state ─────────────────────────────────────
  const micIcon = uiState === 'recording' ? '⏹' : uiState === 'speaking' ? '🔇' : '🎙';
  const micColor = uiState === 'recording' ? Colors.danger : uiState === 'speaking' ? Colors.warning : Colors.primary;
  const micDisabled = uiState === 'processing' || uiState === 'searching' || uiState === 'greeting' || uiState === 'done';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { stopSpeaking(); router.back(); }} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>🤖 Haazir AI</Text>
          <Text style={styles.headerPhase}>{PHASE_LABEL[phase]}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Conversation transcript */}
      <ScrollView
        ref={scrollRef}
        style={styles.transcript}
        contentContainerStyle={styles.transcriptContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && uiState === 'greeting' && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Haazir AI bol raha hai...</Text>
          </View>
        )}

        {messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.agentBubble]}>
            {m.role === 'agent' && <Text style={styles.bubbleLabel}>🤖 Haazir AI</Text>}
            <Text style={[styles.bubbleText, m.role === 'user' && styles.userBubbleText]}>{m.text}</Text>
          </View>
        ))}

        {/* Searching indicator — only while API call is in flight */}
        {uiState === 'searching' && (
          <View style={styles.searchingCard}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.searchingText}>Agents kaam par hain... providers dhoondh rahe hain 🤖</Text>
          </View>
        )}

        {/* Provider cards — hide after booking is done */}
        {providers.length > 0 && uiState !== 'done' && (
          <View style={styles.providersSection}>
            <Text style={styles.providersLabel}>Yeh providers mile:</Text>
            {providers.map((p, i) => (
              <ProviderCard key={p.id} provider={p} rank={i + 1} onSelect={() => handleSelectProvider(p)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Processing state */}
      {(uiState === 'processing') && (
        <View style={styles.processingBar}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.processingText}>Samajh raha hun...</Text>
        </View>
      )}

      {/* Booking Done — show receipt button always when conversation ends */}
      {uiState === 'done' && (
        <TouchableOpacity
          style={[styles.bookingDoneBtn, { marginBottom: insets.bottom + Spacing.md }]}
          onPress={() => {
            const fallbackProvider = bookingResult?.provider || providers[0];
            if (bookingResult && fallbackProvider) {
              router.replace({
                pathname: '/booking',
                params: {
                  providerData: JSON.stringify(fallbackProvider),
                  priceData: JSON.stringify({ total: fallbackProvider?.base_rate || 2500 }),
                  confirmedData: JSON.stringify({
                    booking_id: bookingResult.booking_id,
                    receipt: bookingResult.receipt,
                    confirmation_message: bookingResult.confirmation_message,
                    reminders: bookingResult.reminders,
                  }),
                },
              });
            } else if (fallbackProvider) {
              router.replace({
                pathname: '/booking',
                params: {
                  providerData: JSON.stringify(fallbackProvider),
                  priceData: JSON.stringify({ total: fallbackProvider?.base_rate || 2500 }),
                },
              });
            }
          }}
        >
          <Text style={styles.bookingDoneBtnText}>📋 Booking Details Dekhein →</Text>
        </TouchableOpacity>
      )}

      {/* Mic Button */}
      {uiState !== 'done' && (
        <View style={[styles.micRow, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Text style={styles.micHint}>
            {uiState === 'recording' ? 'Bol dein — phir roko' :
             uiState === 'speaking' ? 'Tap karo agent ko rokne ke liye' :
             uiState === 'idle' ? 'Tap karo aur bolein' : ''}
          </Text>
          <Animated.View style={[styles.micBtn, { backgroundColor: micColor, transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity onPress={handleMic} disabled={micDisabled} style={styles.micInner}>
              {micDisabled && uiState !== 'speaking'
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.micIcon}>{micIcon}</Text>
              }
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backIcon: { fontSize: 20, color: Colors.primary },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  headerPhase: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  transcript: { flex: 1 },
  transcriptContent: { padding: Spacing.md, paddingBottom: Spacing.xl },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm },
  bubble: {
    maxWidth: '80%', borderRadius: Radius.lg, padding: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  agentBubble: {
    backgroundColor: Colors.surfaceElevated, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: Colors.border,
  },
  userBubble: {
    backgroundColor: Colors.primary, alignSelf: 'flex-end',
  },
  bubbleLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 3, fontWeight: '700' },
  bubbleText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  userBubbleText: { color: '#fff' },
  searchingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primaryDim, borderRadius: Radius.md,
    padding: Spacing.md, marginVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary,
  },
  searchingText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  providersSection: { marginTop: Spacing.md },
  providersLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: Spacing.sm },
  processingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.cardBg, paddingVertical: 8, paddingHorizontal: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  processingText: { color: Colors.textMuted, fontSize: FontSize.sm },
  micRow: {
    alignItems: 'center', paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  bookingDoneBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md + 4,
    alignItems: 'center', marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    ...Shadow.primary,
  },
  bookingDoneBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  micHint: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: Spacing.sm },
  micBtn: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.primary,
  },
  micInner: { justifyContent: 'center', alignItems: 'center' },
  micIcon: { fontSize: 30, color: '#fff' },
});
