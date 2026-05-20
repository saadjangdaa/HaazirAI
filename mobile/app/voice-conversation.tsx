import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing, Alert, TextInput, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { requestMicPermission, startRecording, stopAndTranscribe } from '../services/voiceRecord';
import { playBase64Audio, stopSpeaking } from '../services/voicePlayback';
import {
  startConversation, sendMessage, negotiateProviders, directBook, toBiddingResponse,
  ConversationTurn, ConversationPhase, BookingResult, NegotiatedBid, HistoryEntry,
} from '../services/conversationApi';
import { BiddingResponse, Bid } from '../services/api';
import ProviderCard from '../components/ProviderCard';
import BiddingPanel from '../components/BiddingPanel';

export const options = { headerShown: false };

// ── Chat item types — everything in one ordered array ──────────────────────
type ChatItem =
  | { id: string; kind: 'text'; role: 'user' | 'agent'; text: string }
  | { id: string; kind: 'providers'; items: any[] }
  | { id: string; kind: 'actions' }
  | { id: string; kind: 'negotiated'; bid: NegotiatedBid }
  | { id: string; kind: 'bidding'; result: BiddingResponse }
  | { id: string; kind: 'livebidding'; bids: Bid[]; complete: boolean; recommendedId?: string };

let _idCtr = 0;
function mk<T extends Omit<ChatItem, 'id'>>(item: T): ChatItem {
  return { ...item, id: `ci-${++_idCtr}` } as ChatItem;
}

type UIState = 'greeting' | 'idle' | 'recording' | 'processing' | 'speaking'
             | 'searching' | 'negotiating' | 'done';

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
  const userName = user?.username || (user as any)?.name || '';

  const [chat, setChat] = useState<ChatItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [uiState, setUiState] = useState<UIState>('greeting');
  const [phase, setPhase] = useState<ConversationPhase>('intake');
  const [providers, setProviders] = useState<any[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [textInput, setTextInput] = useState('');

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

  // ── Play agent audio & push items into chat array ─────────────────────────
  const playAgentTurn = useCallback((turn: ConversationTurn) => {
    setPhase(turn.phase);
    const agentText = turn.response_text?.trim() || '...';

    // Record agent response in history for session recovery
    setHistory((prev) => [...prev, { role: 'assistant', content: agentText }]);

    const additions: ChatItem[] = [mk({ kind: 'text', role: 'agent', text: agentText })];

    if (turn.providers?.length) {
      setProviders(turn.providers);
      additions.push(mk({ kind: 'providers', items: turn.providers }));
      additions.push(mk({ kind: 'actions' }));
    }
    if (turn.request_id) setRequestId(turn.request_id);
    if (turn.booking_result) setBookingResult(turn.booking_result);

    setChat((prev) => [...prev, ...additions]);

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

  // ── Initial greeting ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const turn = await startConversation(sessionId.current, user?.id || 'user_001', userName);
        if (!cancelled) playAgentTurn(turn);
      } catch {
        if (!cancelled) {
          setChat([mk({ kind: 'text', role: 'agent', text: 'Haazir AI mein khush amdeed! Kya chahiye?' })]);
          setUiState('idle');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, [chat, uiState]);

  // ── Mic button ────────────────────────────────────────────────────────────
  const handleMic = async () => {
    if (uiState === 'recording') {
      setUiState('processing');
      stopPulse();
      try {
        const { text } = await stopAndTranscribe();
        if (!text) { setUiState('idle'); return; }
        setChat((prev) => [...prev, mk({ kind: 'text', role: 'user', text })]);
        setHistory((prev) => [...prev, { role: 'user', content: text }]);
        setUiState('searching');
        const currentHistory = history.concat({ role: 'user', content: text });
        const turn = await sendMessage(sessionId.current, text, user?.id || 'anonymous', userName, currentHistory);
        playAgentTurn(turn);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Masla hua — dobara try karein');
        setUiState('idle');
      }
    } else if (uiState === 'idle') {
      const granted = await requestMicPermission();
      if (!granted) { Alert.alert('Permission Chahiye', 'Microphone access allow karein settings mein'); return; }
      try {
        await stopSpeaking();
        await startRecording();
        setUiState('recording');
        startPulse();
      } catch {
        Alert.alert('Error', 'Recording shuru nahi ho saki');
      }
    } else if (uiState === 'speaking') {
      await stopSpeaking();
      stopPulse();
      setUiState('idle');
    }
  };

  // ── Text send ─────────────────────────────────────────────────────────────
  const handleSendText = async () => {
    const text = textInput.trim();
    if (!text || uiState === 'done') return;
    setTextInput('');
    setChat((prev) => [...prev, mk({ kind: 'text', role: 'user', text })]);
    setHistory((prev) => [...prev, { role: 'user', content: text }]);
    setUiState('searching');
    try {
      const currentHistory = history.concat({ role: 'user', content: text });
      const turn = await sendMessage(sessionId.current, text, user?.id || 'anonymous', userName, currentHistory);
      playAgentTurn(turn);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Masla hua — dobara try karein');
      setUiState('idle');
    }
  };

  // ── Negotiate — InDrive-style live bid drip ────────────────────────────────
  const handleNegotiate = async () => {
    setChat((prev) => [
      ...prev.filter((i) => i.kind !== 'actions'),
      mk({ kind: 'text', role: 'agent', text: 'Workers ko job broadcast kar diya — bids aa rahi hain! 🏃' }),
    ]);
    setUiState('negotiating');

    // Push the live-bidding shell immediately (empty, loading open)
    const liveItem = mk({ kind: 'livebidding' as const, bids: [], complete: false });
    const liveId = liveItem.id;
    setChat((prev) => [...prev, liveItem]);

    try {
      const res = await negotiateProviders(sessionId.current, user?.id || 'anonymous', providers);
      if (res.top_bids?.length) {
        const biddingResult = toBiddingResponse(requestId || 'req', res.top_bids, providers, []);
        const recommendedId = biddingResult.recommended_bid.provider_id;

        // Drip each bid in 1.2 s apart — InDrive style
        biddingResult.bids.forEach((bid, index) => {
          setTimeout(() => {
            setChat((prev) =>
              prev.map((item) =>
                item.id === liveId && item.kind === 'livebidding'
                  ? { ...item, bids: [...item.bids, bid] }
                  : item,
              ),
            );
          }, (index + 1) * 1200);
        });

        // Mark complete 600 ms after the last bid arrives
        const totalDelay = (biddingResult.bids.length + 1) * 1200 + 600;
        setTimeout(() => {
          setChat((prev) =>
            prev.map((item) =>
              item.id === liveId && item.kind === 'livebidding'
                ? { ...item, complete: true, recommendedId }
                : item,
            ),
          );
          setUiState('idle');
        }, totalDelay);
      } else {
        setChat((prev) => [
          ...prev.filter((i) => i.id !== liveId),
          mk({ kind: 'text', role: 'agent', text: 'Abhi koi bid nahi aayi — seedha book kar sakte hain.' }),
        ]);
        setUiState('idle');
      }
    } catch (e: any) {
      console.error('[negotiate]', e);
      const detail = e?.response?.data?.detail || e?.message || 'Unknown error';
      setChat((prev) => [
        ...prev.filter((i) => i.id !== liveId),
        mk({ kind: 'text', role: 'agent', text: `Negotiate mein masla hua (${detail}). Seedha book kar sakte hain.` }),
      ]);
      setUiState('idle');
    }
  };

  // ── Direct book ───────────────────────────────────────────────────────────
  const handleDirectBook = async (providerId?: string, priceAccepted?: number) => {
    const uid = user?.id;
    if (!uid) { Alert.alert('Login Karein', 'Booking ke liye pehle login karein'); return; }
    const top = providers.find((p) => p.id === providerId) || providers[0];
    const pid = providerId || top?.id;
    const price = priceAccepted || top?.base_rate || 2500;
    if (!pid) return;

    setChat((prev) => [
      ...prev.filter((i) => i.kind !== 'actions' && i.kind !== 'negotiated'),
      mk({ kind: 'text', role: 'user', text: 'Booking karo' }),
    ]);
    setUiState('searching');
    try {
      const result = await directBook(sessionId.current, uid, pid, price, 'cash', top);
      setBookingResult(result);
      const waNote = result.whatsapp_sent ? ' 📱 WhatsApp confirmation bhej di gayi.' : '';
      setChat((prev) => [...prev, mk({ kind: 'text', role: 'agent', text: `✅ Booking confirm! ID: ${result.booking_id}.${waNote}` })]);
      setPhase('done');
      setUiState('done');
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Server error';
      Alert.alert('Booking Error', detail);
      setUiState('idle');
    }
  };

  // ── Select bid from BiddingPanel (confirmation before booking) ───────────
  const handleSelectBid = useCallback((bid: Bid) => {
    Alert.alert(
      'Booking Confirm Karein',
      `${bid.provider_name} ne Rs. ${bid.final_price.toLocaleString()} mein negotiate kar liya hai.\n\nIs worker ke saath booking karni hai?`,
      [
        { text: 'Nahi', style: 'cancel' },
        { text: 'Haan, Book Karein ✅', onPress: () => handleDirectBook(bid.provider_id, bid.final_price) },
      ],
    );
  }, [handleDirectBook]);

  // ── Provider card tap → go to booking screen ──────────────────────────────
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

  const micIcon = uiState === 'recording' ? '⏹' : uiState === 'speaking' ? '🔇' : '🎙';
  const micColor = uiState === 'recording' ? Colors.danger : uiState === 'speaking' ? Colors.warning : Colors.primary;
  const micDisabled = ['processing', 'searching', 'greeting', 'done', 'negotiating'].includes(uiState);
  const isLoading = uiState === 'searching' || uiState === 'negotiating' || uiState === 'processing';

  // ── Render a single chat item ─────────────────────────────────────────────
  const renderItem = (item: ChatItem) => {
    switch (item.kind) {
      case 'text':
        return (
          <View key={item.id} style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.agentBubble]}>
            {item.role === 'agent' && <Text style={styles.bubbleLabel}>🤖 Haazir AI</Text>}
            <Text style={[styles.bubbleText, item.role === 'user' && styles.userBubbleText]}>{item.text}</Text>
          </View>
        );

      case 'providers':
        return (
          <View key={item.id} style={styles.providersSection}>
            <Text style={styles.providersLabel}>Yeh providers mile:</Text>
            {item.items.map((p, i) => (
              <ProviderCard key={p.id || i} provider={p} rank={i + 1} onSelect={() => handleSelectProvider(p)} />
            ))}
          </View>
        );

      case 'actions':
        if (isLoading || uiState === 'done') return null;
        return (
          <View key={item.id} style={styles.actionBar}>
            <Text style={styles.actionLabel}>Kya karna chahte hain?</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionBtn, styles.negotiateBtn]} onPress={handleNegotiate}>
                <Text style={styles.actionBtnIcon}>🤝</Text>
                <Text style={styles.actionBtnTitle}>Moltol Karein</Text>
                <Text style={styles.actionBtnSub}>Price negotiate karo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.directBookBtn]} onPress={() => handleDirectBook()}>
                <Text style={styles.actionBtnIcon}>⚡</Text>
                <Text style={styles.actionBtnTitle}>Seedha Book</Text>
                <Text style={styles.actionBtnSub}>
                  Rs. {(providers[0]?.base_rate || 2500).toLocaleString()}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'bidding':
        if (uiState === 'done') return null;
        return (
          <View key={item.id} style={styles.biddingWrapper}>
            <BiddingPanel loading={false} result={item.result} onSelectBid={handleSelectBid} />
          </View>
        );

      case 'livebidding': {
        if (uiState === 'done') return null;
        return (
          <View key={item.id} style={styles.liveBidContainer}>
            {/* Header */}
            <View style={styles.liveBidHeader}>
              <Text style={styles.liveBidHeaderText}>🏁 Worker Bids</Text>
              {!item.complete && (
                <View style={styles.liveDot}>
                  <ActivityIndicator size="small" color={Colors.warning} />
                  <Text style={styles.liveDotText}>LIVE</Text>
                </View>
              )}
              {item.complete && (
                <Text style={styles.liveBidDoneTag}>✅ Bids aa gayi</Text>
              )}
            </View>

            {/* Bid cards dripping in */}
            {item.bids.map((bid) => {
              const isRec = bid.provider_id === item.recommendedId;
              return (
                <View
                  key={bid.provider_id}
                  style={[styles.liveBidCard, isRec && styles.liveBidCardRec]}
                >
                  {isRec && (
                    <View style={styles.liveBidRecBadge}>
                      <Text style={styles.liveBidRecBadgeText}>⭐ BEST DEAL</Text>
                    </View>
                  )}
                  <View style={styles.liveBidRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.liveBidName}>{bid.provider_name}</Text>
                      <Text style={styles.liveBidMeta}>
                        ⭐ {bid.rating}  ·  🛵 {bid.eta_minutes} min
                        {bid.negotiated ? '  ·  💬 Negotiated' : ''}
                      </Text>
                    </View>
                    <View style={styles.liveBidPriceCol}>
                      {bid.negotiated && (
                        <Text style={styles.liveBidOrigPrice}>
                          Rs. {bid.bid_price.toLocaleString()}
                        </Text>
                      )}
                      <Text style={[styles.liveBidFinalPrice, isRec && styles.liveBidFinalPriceRec]}>
                        Rs. {bid.final_price.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.liveBidMessage}>"{bid.message}"</Text>
                  <TouchableOpacity
                    style={[styles.liveBidSelectBtn, isRec && styles.liveBidSelectBtnRec]}
                    onPress={() => handleSelectBid(bid)}
                  >
                    <Text style={[styles.liveBidSelectText, isRec && styles.liveBidSelectTextRec]}>
                      {isRec ? '✅ Ye Waala Chunein' : 'Is Se Book Karein'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Waiting indicator while more bids expected */}
            {!item.complete && (
              <View style={styles.liveBidWaiting}>
                <ActivityIndicator size="small" color={Colors.warning} />
                <Text style={styles.liveBidWaitingText}>Aur bids aa rahi hain...</Text>
              </View>
            )}
          </View>
        );
      }

      case 'negotiated':
        if (isLoading || uiState === 'done') return null;
        return (
          <View key={item.id} style={styles.negotiatedCard}>
            <Text style={styles.negotiatedTitle}>🎉 Moltol Ho Gaya!</Text>
            <Text style={styles.negotiatedProvider}>{item.bid.provider_name}</Text>
            <Text style={styles.negotiatedPrice}>Rs. {item.bid.bid_price.toLocaleString()}</Text>
            {(item.bid.savings ?? 0) > 0 && (
              <Text style={styles.negotiatedSavings}>✂️ Rs. {item.bid.savings!.toLocaleString()} bachaye!</Text>
            )}
            <TouchableOpacity
              style={styles.confirmBookBtn}
              onPress={() => handleDirectBook(item.bid.provider_id, item.bid.bid_price)}
            >
              <Text style={styles.confirmBookBtnText}>✅ Confirm Booking Karein →</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

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

      {/* Chat transcript — single ordered list */}
      <ScrollView
        ref={scrollRef}
        style={styles.transcript}
        contentContainerStyle={styles.transcriptContent}
        showsVerticalScrollIndicator={false}
      >
        {chat.length === 0 && uiState === 'greeting' && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Haazir AI bol raha hai...</Text>
          </View>
        )}

        {chat.map(renderItem)}

        {/* Transient loading indicators — always at the bottom */}
        {uiState === 'searching' && (
          <View style={styles.searchingCard}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.searchingText}>Agents kaam par hain... providers dhoondh rahe hain 🤖</Text>
          </View>
        )}
        {uiState === 'negotiating' && (
          <View style={[styles.searchingCard, styles.negotiatingCard]}>
            <ActivityIndicator color={Colors.warning} size="small" />
            <Text style={[styles.searchingText, { color: Colors.warning }]}>Moltol agent negotiate kar raha hai... 🤝</Text>
          </View>
        )}
        {uiState === 'processing' && (
          <View style={styles.searchingCard}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.searchingText}>Samajh raha hun...</Text>
          </View>
        )}
      </ScrollView>

      {/* Booking Done — WhatsApp + receipt buttons */}
      {uiState === 'done' && (() => {
        const providerPhone = bookingResult?.provider?.phone || bookingResult?.provider?.contact_number;
        const waText = encodeURIComponent(
          `Assalam o Alaikum! Meri Haazir AI booking hai — ID: ${bookingResult?.booking_id || ''}. Aap kab aa rahe hain?`
        );
        const waUrl = providerPhone
          ? `https://wa.me/92${String(providerPhone).replace(/^0/, '')}?text=${waText}`
          : `https://wa.me/?text=${waText}`;
        return (
          <View style={[styles.doneButtonsRow, { marginBottom: insets.bottom + Spacing.md }]}>
            <TouchableOpacity
              style={styles.whatsappBtn}
              onPress={() => Linking.openURL(waUrl).catch(() => Alert.alert('WhatsApp nahi khula', 'WhatsApp install hai?'))}
            >
              <Text style={styles.whatsappBtnText}>💬 WhatsApp par Contact Karein</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bookingDoneBtn}
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
          </View>
        );
      })()}

      {/* Input Bar */}
      {uiState !== 'done' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <View style={styles.textRow}>
              <TextInput
                style={styles.textField}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Type karein..."
                placeholderTextColor={Colors.textMuted}
                editable={!isLoading && uiState !== 'greeting'}
                onSubmitEditing={handleSendText}
                returnKeyType="send"
                multiline={false}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!textInput.trim() || isLoading) && styles.sendBtnDisabled]}
                onPress={handleSendText}
                disabled={!textInput.trim() || isLoading}
              >
                <Text style={styles.sendBtnIcon}>➤</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.micRow}>
              <Text style={styles.micHint}>
                {uiState === 'recording' ? 'Bol dein — phir roko' :
                 uiState === 'speaking' ? 'Tap karo agent ko rokne ke liye' :
                 uiState === 'idle' ? 'Ya bolein:' : ''}
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
          </View>
        </KeyboardAvoidingView>
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
    maxWidth: '80%', borderRadius: Radius.lg, padding: Spacing.sm + 2, marginBottom: Spacing.sm,
  },
  agentBubble: {
    backgroundColor: Colors.surfaceElevated, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: Colors.border,
  },
  userBubble: { backgroundColor: Colors.primary, alignSelf: 'flex-end' },
  bubbleLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 3, fontWeight: '700' },
  bubbleText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  userBubbleText: { color: '#fff' },
  providersSection: { marginTop: Spacing.sm, marginBottom: Spacing.xs },
  providersLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: Spacing.sm },
  searchingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primaryDim, borderRadius: Radius.md,
    padding: Spacing.md, marginVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary,
  },
  searchingText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  negotiatingCard: { backgroundColor: Colors.warningDim, borderColor: Colors.warning },
  // Action buttons
  actionBar: {
    marginTop: Spacing.sm, marginBottom: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.card,
  },
  actionLabel: {
    fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary,
    marginBottom: Spacing.sm, textAlign: 'center',
  },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 4 },
  negotiateBtn: { backgroundColor: Colors.warningDim, borderWidth: 1, borderColor: Colors.warning },
  directBookBtn: { backgroundColor: Colors.primaryDim, borderWidth: 1, borderColor: Colors.primary },
  actionBtnIcon: { fontSize: 22 },
  actionBtnTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textPrimary },
  actionBtnSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  // Negotiated bid card
  negotiatedCard: {
    marginTop: Spacing.sm, marginBottom: Spacing.xs,
    backgroundColor: Colors.successDim, borderRadius: Radius.lg,
    padding: Spacing.md + 4, borderWidth: 1, borderColor: Colors.success,
    alignItems: 'center', ...Shadow.card,
  },
  negotiatedTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  negotiatedProvider: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 2 },
  negotiatedPrice: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.success, marginBottom: 4 },
  negotiatedSavings: { fontSize: FontSize.sm, color: Colors.success, fontWeight: '600', marginBottom: Spacing.sm },
  confirmBookBtn: {
    backgroundColor: Colors.success, borderRadius: Radius.lg,
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs, ...Shadow.sm,
  },
  confirmBookBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },
  biddingWrapper: { marginTop: Spacing.sm, marginBottom: Spacing.xs },
  // Live bidding (InDrive-style)
  liveBidContainer: {
    marginTop: Spacing.sm, marginBottom: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    ...Shadow.card,
  },
  liveBidHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  liveBidHeaderText: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textPrimary },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDotText: {
    color: Colors.warning, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1,
  },
  liveBidDoneTag: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success },
  liveBidCard: {
    marginHorizontal: Spacing.sm, marginTop: Spacing.sm,
    backgroundColor: Colors.cardBg, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
    position: 'relative',
  },
  liveBidCardRec: { borderColor: Colors.primary, backgroundColor: '#E6FAF5' },
  liveBidRecBadge: {
    position: 'absolute', top: -10, right: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  liveBidRecBadgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '800' },
  liveBidRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  liveBidName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  liveBidMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  liveBidPriceCol: { alignItems: 'flex-end', marginLeft: Spacing.sm },
  liveBidOrigPrice: {
    fontSize: FontSize.xs, color: Colors.textMuted, textDecorationLine: 'line-through',
  },
  liveBidFinalPrice: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  liveBidFinalPriceRec: { color: Colors.primary },
  liveBidMessage: {
    fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic',
    marginTop: Spacing.xs, marginBottom: Spacing.sm,
  },
  liveBidSelectBtn: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.sm, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  liveBidSelectBtnRec: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  liveBidSelectText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  liveBidSelectTextRec: { color: '#fff', fontWeight: '800' },
  liveBidWaiting: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: Spacing.md, margin: Spacing.sm,
    backgroundColor: Colors.warningDim, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.warning,
  },
  liveBidWaitingText: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: '600' },
  // Booking done
  doneButtonsRow: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md, gap: Spacing.sm,
  },
  whatsappBtn: {
    backgroundColor: '#25D366', borderRadius: Radius.lg, padding: Spacing.md + 4,
    alignItems: 'center', ...Shadow.card,
  },
  whatsappBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  bookingDoneBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md + 4,
    alignItems: 'center', ...Shadow.primary,
  },
  bookingDoneBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  // Input bar
  inputBar: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface, paddingTop: Spacing.sm, paddingHorizontal: Spacing.md,
  },
  textRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  textField: {
    flex: 1, backgroundColor: Colors.cardBg, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: FontSize.sm, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendBtnIcon: { color: '#fff', fontSize: 16, fontWeight: '700' },
  micRow: { alignItems: 'center' },
  micHint: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: Spacing.sm },
  micBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', ...Shadow.primary },
  micInner: { justifyContent: 'center', alignItems: 'center' },
  micIcon: { fontSize: 30, color: '#fff' },
});
