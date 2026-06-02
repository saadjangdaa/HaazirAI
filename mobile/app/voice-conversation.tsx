import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing, Alert, TextInput, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { requestMicPermission, startRecording, stopAndTranscribe, cleanupRecording } from '../services/voiceRecord';
import { playBase64Audio, stopSpeaking } from '../services/voicePlayback';
import { speakText } from '../services/voiceSpeech';
import {
  startConversation, sendMessage, negotiateProviders, directBook, toBiddingResponse,
  ConversationTurn, ConversationPhase, BookingResult, NegotiatedBid, HistoryEntry,
} from '../services/conversationApi';
import { BiddingResponse, Bid } from '../services/api';
import ProviderCard from '../components/ProviderCard';
import BiddingPanel from '../components/BiddingPanel';
import { useMockData } from '../context/MockDataContext';
import { MOCK_BIDS, makeMockBookingResult } from '../data/mockData';
import { useLang } from '../context/LanguageContext';
import { saveVoiceSession, getVoiceSession, saveJobRequestToFirestore } from '../services/chatService';

const DEFAULT_VOICE_ID = 'v_meklc281';
const VOICE_IDS: Record<string, string> = {
  sindhi:  'v_sd0kl3m9',
  balochi: 'v_bl1de2f7',
};

export const options = { headerShown: false };

// ── Chat item types — everything in one ordered array ──────────────────────
type ChatItem =
  | { id: string; kind: 'text'; role: 'user' | 'agent'; text: string }
  | { id: string; kind: 'providers'; items: any[] }
  | { id: string; kind: 'actions' }
  | { id: string; kind: 'negotiated'; bid: NegotiatedBid }
  | { id: string; kind: 'bidding'; result: BiddingResponse }
  | { id: string; kind: 'livebidding'; bids: Bid[]; complete: boolean; recommendedId?: string }
  | { id: string; kind: 'waitlist_prompt'; service: string; location: string; city: string; intent: any }
  | { id: string; kind: 'emergency_112'; message: string }
  | { id: string; kind: 'clarification'; question: string }
  | { id: string; kind: 'judge_note' };

const EMERGENCY_KEYWORDS_VOICE = [
  'short circuit', 'gas leak', 'bijli ka jhatka', 'aag lagi', 'aag lag', 'flood',
  'electric shock', 'current lag', 'gas lick', 'bijli ka short', 'short circut',
];

function detectEmergencyVoice(text: string): boolean {
  const lower = text.toLowerCase();
  return EMERGENCY_KEYWORDS_VOICE.some((kw) => lower.includes(kw));
}

const JUDGE_KEYWORDS = [
  'judges ko', 'judges ke baare', 'hackathon judges', 'ai seekho judges',
  'ai seekho hackathon', 'fatima judges', 'jury ko', 'closing note',
];

function detectJudgeQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return JUDGE_KEYWORDS.some((kw) => lower.includes(kw));
}

// Urdu script — sent directly to Uplift AI (no Gemini translation needed)
const JUDGE_PITCH_URDU =
  'السلام علیکم معزز ججز! ' +
  'میں فاطمہ ہوں — ہاضر اے آئی کی اجنٹک وائس اسسٹنٹ۔ ' +
  'ہاضر اے آئی پاکستان کی انفارمل اکانومی کے لیے بنا ہے — ' +
  'نو اے آئی ایجنٹس، گوگل اینٹی گریویٹی سے آرکیسٹریٹڈ، جیمنائی فلیش سے پاورڈ۔ ' +
  'آئی سیکھو ہیکاتھون کے تمام ججز کا دل سے شکریہ۔ ' +
  'جو بھی چاہیے — بھائی حاضر ہے!';

// Display text (Roman Urdu — shown in card UI)
const JUDGE_PITCH_TEXT =
  'Assalam-o-Alaikum honorable judges! Main Fatima hun — Haazir AI ki agentic assistant. ' +
  'Haazir AI Pakistan ki informal economy ke liye bana hai — 9 AI agents, ' +
  'Google Antigravity se orchestrated, Gemini 3.5 Flash se powered. ' +
  'AI Seekho Hackathon ke tamam judges ka dil se shukriya. ' +
  'Jo bhi chahiye — bhai Haazir hai! 🙏';

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
  const { resumeSessionId } = useLocalSearchParams<{ resumeSessionId?: string }>();
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const { language, langReady } = useLang();
  const insets = useSafeAreaInsets();
  const voiceId = VOICE_IDS[language] ?? DEFAULT_VOICE_ID;
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sessionId = useRef(resumeSessionId || generateSessionId());
  const userName = user?.username || (user as any)?.name || '';
  const jobPostedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResumingRef = useRef(!!resumeSessionId);

  const [chat, setChat] = useState<ChatItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [uiState, setUiState] = useState<UIState>(resumeSessionId ? 'idle' : 'greeting');
  const [phase, setPhase] = useState<ConversationPhase>('intake');
  const [providers, setProviders] = useState<any[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const lastIntentRef = useRef<any>(null);

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

    // Case 4: Emergency fast-track banner
    if ((turn as any).emergency) {
      setIsEmergency(true);
    }

    // Case 2: Clarification question detected
    if ((turn as any).clarification_needed && (turn as any).clarification_question) {
      additions.push(mk({ kind: 'clarification', question: (turn as any).clarification_question }));
    }

    if (turn.providers?.length) {
      setProviders(turn.providers);
      lastIntentRef.current = (turn as any).extracted_intent || null;
      additions.push(mk({ kind: 'providers', items: turn.providers }));
      additions.push(mk({ kind: 'actions' }));

      // Create open job_request in Firestore so notified workers see it
      if (!jobPostedRef.current && !isMockMode && user?.id) {
        jobPostedRef.current = true;
        const jobId = turn.request_id || `JR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
        const notifiedIds = turn.providers
          .map((p: any) => p.id || p.provider_id)
          .filter(Boolean) as string[];
        saveJobRequestToFirestore({
          job_request_id: jobId,
          customer_id: user.id,
          customer_name: userName || 'Customer',
          service: turn.search_trigger?.service || turn.providers[0]?.service || 'Service',
          location: turn.search_trigger?.location || user?.city || '',
          city: turn.providers[0]?.city || user?.city || '',
          urgency: turn.search_trigger?.urgency || 'medium',
          description: '',
          estimated_price: turn.providers[0]?.base_rate || 0,
          expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          notified_provider_ids: notifiedIds,
        }).catch(() => {});
      }
    }
    // Case 1 & 4: No providers found — show waitlist or 112
    const searchPhase = turn.phase === 'searching' || turn.phase === 'confirming';
    if (searchPhase && turn.providers !== undefined && turn.providers.length === 0) {
      if ((turn as any).emergency || isEmergency) {
        additions.push(mk({ kind: 'emergency_112', message: 'Haazir AI ke paas abhi emergency provider nahi. 112 call karein.' }));
      } else {
        const intent = (turn as any).extracted_intent || lastIntentRef.current || {};
        additions.push(mk({
          kind: 'waitlist_prompt',
          service: intent.service_type || 'Service',
          location: intent.location || '',
          city: intent.city || 'Islamabad',
          intent,
        }));
      }
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

  // ── Cleanup recording on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopSpeaking();
      cleanupRecording();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Resume old session from Firestore ─────────────────────────────────────
  useEffect(() => {
    if (!resumeSessionId || !user?.id) return;
    (async () => {
      try {
        const saved = await getVoiceSession(resumeSessionId);
        if (!saved) {
          setChat([mk({ kind: 'text', role: 'agent', text: 'Chat nahi mili — naya session shuru ho raha hai.' })]);
          setUiState('idle');
          return;
        }
        sessionId.current = saved.session_id;
        setHistory(saved.history);
        setPhase(saved.phase as ConversationPhase);
        const recentHistory = saved.history.slice(-6);
        const resumeItems: ChatItem[] = [
          mk({ kind: 'text', role: 'agent', text: `📂 Puranic baat cheet resume ho rahi hai${saved.service_type ? ` — ${saved.service_type}` : ''}...` }),
          ...recentHistory.map((h) => mk({ kind: 'text', role: h.role === 'user' ? 'user' : 'agent', text: h.content })),
          mk({ kind: 'text', role: 'agent', text: 'Aap jahan chodh ke gaye the, wahan se dobara shuru karein. Kya chahiye?' }),
        ];
        setChat(resumeItems);
        setUiState('idle');
      } catch {
        setChat([mk({ kind: 'text', role: 'agent', text: 'Chat resume nahi ho saki. Naya session shuru karein.' })]);
        setUiState('idle');
      }
    })();
  }, [resumeSessionId, user?.id]);

  // ── Auto-save session to Firestore on history change ──────────────────────
  useEffect(() => {
    if (!user?.id || history.length === 0 || isMockMode) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const lastUserMsg = [...history].reverse().find((h) => h.role === 'user')?.content || '';
      const serviceType = providers[0]?.service || '';
      const title = serviceType
        ? `${serviceType} — ${new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}`
        : lastUserMsg.slice(0, 40) || 'Voice Chat';
      await saveVoiceSession({
        session_id: sessionId.current,
        user_id: user.id,
        title,
        last_message: lastUserMsg.slice(0, 100),
        phase,
        service_type: serviceType,
        status: phase === 'done' ? 'completed' : 'active',
        history,
        created_at: '',
        updated_at: '',
      }).catch(() => {});
    }, 1500);
  }, [history]);

  // ── Initial greeting — skip if resuming ───────────────────────────────────
  useEffect(() => {
    if (!langReady || isResumingRef.current) return;
    let cancelled = false;
    const startTime = Date.now();
    const MAX_WAIT_MS = 60000;
    const RETRY_MS = 5000;

    const tryGreeting = async () => {
      try {
        const turn = await startConversation(
          sessionId.current, user?.id || 'user_001', userName, voiceId, language, user?.city || '',
        );
        if (!cancelled) playAgentTurn(turn);
      } catch {
        if (cancelled) return;
        if (Date.now() - startTime < MAX_WAIT_MS) {
          // Keep spinner, retry silently
          setTimeout(tryGreeting, RETRY_MS);
        } else {
          const name = userName.split(' ')[0] || userName;
          const greeting = name
            ? `Assalam-o-Alaikum ${name}! Main Fatima hun — Haazir AI ki assistant. Aaj kya chahiye?`
            : 'Assalam-o-Alaikum! Main Fatima hun — Haazir AI ki assistant. Aaj kya chahiye?';
          setChat([mk({ kind: 'text', role: 'agent', text: greeting })]);
          setUiState('idle');
        }
      }
    };

    tryGreeting();
    return () => { cancelled = true; };
  }, [langReady]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, [chat, uiState]);

  // ── Mic button ────────────────────────────────────────────────────────────
  const handleMic = async () => {
    if (uiState === 'recording') {
      setUiState('processing');
      stopPulse();

      // Show placeholder immediately so user sees their action was registered
      const placeholderId = `ph-${Date.now()}`;
      setChat((prev) => [...prev, { id: placeholderId, kind: 'text' as const, role: 'user' as const, text: '🎙 ...' }]);

      try {
        const { text } = await stopAndTranscribe();

        if (!text) {
          // Replace placeholder with retry hint
          setChat((prev) => prev.map((item) =>
            item.id === placeholderId
              ? mk({ kind: 'text', role: 'agent', text: '🎙 Awaaz clear nahi aayi — dobara bolein ya neeche type karein' })
              : item
          ));
          setUiState('idle');
          return;
        }

        // Replace placeholder with actual transcribed text
        setChat((prev) => prev.map((item) =>
          item.id === placeholderId ? { ...item, text } : item
        ));
        // Judge easter egg — intercept before API
        if (detectJudgeQuery(text)) {
          handleJudgeNote();
          return;
        }
        setHistory((prev) => [...prev, { role: 'user', content: text }]);
        if (detectEmergencyVoice(text)) setIsEmergency(true);
        setUiState('searching');
        const turn = await sendMessage(sessionId.current, text, user?.id || 'anonymous', userName, history, voiceId, language, user?.city || '');
        playAgentTurn(turn);
      } catch (e: any) {
        const msg = e?.code === 'ECONNABORTED' || e?.message?.includes('timeout')
          ? 'Server slow hai — thodi der baad dobara try karein'
          : 'Masla hua — type karke bhi bhej sakte hain';
        setChat((prev) => prev.map((item) =>
          item.id === placeholderId
            ? mk({ kind: 'text', role: 'agent', text: `⚠️ ${msg}` })
            : item
        ));
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

  // ── Judge easter egg handler ──────────────────────────────────────────────
  const handleJudgeNote = useCallback(() => {
    // Show card immediately
    setChat((prev) => [...prev, mk({ kind: 'judge_note' })]);
    setUiState('idle');

    // Try Uplift AI voice first (translate=false — Urdu script goes direct, no Gemini needed)
    import('../services/api').then(({ getApiBaseUrl }) => {
      fetch(`${getApiBaseUrl()}/api/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: JUDGE_PITCH_URDU, voice_id: voiceId, translate: false }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.audio_base64) {
            playBase64Audio(d.audio_base64, () => {});
          } else {
            // Uplift returned but no audio — fall back to device TTS
            speakText(JUDGE_PITCH_TEXT);
          }
        })
        .catch(() => {
          // Network error — fall back to device TTS
          speakText(JUDGE_PITCH_TEXT);
        });
    });
  }, [voiceId]);

  // ── Waitlist join handler (voice agent) ──────────────────────────────────
  const handleVoiceWaitlist = async (service: string, location: string, city: string, intent: any) => {
    if (!user?.id || waitlistLoading || waitlistDone) return;
    setWaitlistLoading(true);
    try {
      const { joinWaitlist } = await import('../services/api');
      await joinWaitlist({ userId: user.id, service, location, city, intent });
      setWaitlistDone(true);
      setChat((prev) => [...prev, mk({ kind: 'text', role: 'agent', text: `✅ Waitlist mein shamil ho gaye! Jaisay hi koi ${service} provider available ho ga, hum notify karein ge.` })]);
    } catch {
      setChat((prev) => [...prev, mk({ kind: 'text', role: 'agent', text: 'Waitlist mein shamil nahi ho saka — dobara try karein.' })]);
    } finally {
      setWaitlistLoading(false);
    }
  };

  // ── Text send ─────────────────────────────────────────────────────────────
  const handleSendText = async () => {
    const text = textInput.trim();
    if (!text || uiState === 'done') return;
    setTextInput('');
    setChat((prev) => [...prev, mk({ kind: 'text', role: 'user', text })]);
    // Judge easter egg — intercept before API
    if (detectJudgeQuery(text)) {
      handleJudgeNote();
      return;
    }
    if (detectEmergencyVoice(text)) setIsEmergency(true);
    setHistory((prev) => [...prev, { role: 'user', content: text }]);
    setUiState('searching');
    try {
      const turn = await sendMessage(sessionId.current, text, user?.id || 'anonymous', userName, history, voiceId, language, user?.city || '');
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

    // ── Mock mode: skip API, drip MOCK_BIDS ──────────────────────────────────
    if (isMockMode) {
      const mockRecommendedId = MOCK_BIDS[0].provider_id;
      MOCK_BIDS.forEach((bid, index) => {
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
      setTimeout(() => {
        setChat((prev) =>
          prev.map((item) =>
            item.id === liveId && item.kind === 'livebidding'
              ? { ...item, complete: true, recommendedId: mockRecommendedId }
              : item,
          ),
        );
        setUiState('idle');
      }, (MOCK_BIDS.length + 1) * 1200 + 600);
      return;
    }

    // ── Real mode ─────────────────────────────────────────────────────────────
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

    setChat((prev) => [
      ...prev.filter((i) => i.kind !== 'actions' && i.kind !== 'negotiated'),
      mk({ kind: 'text', role: 'user', text: 'Booking karo' }),
    ]);
    setUiState('searching');

    // ── Mock mode: instant fake booking ──────────────────────────────────────
    if (isMockMode) {
      const mockBid = MOCK_BIDS.find((b) => b.provider_id === providerId) || MOCK_BIDS[0];
      const result = makeMockBookingResult(mockBid.provider_name, price || mockBid.final_price, top?.service || 'Service');
      setBookingResult(result);
      setChat((prev) => [...prev, mk({ kind: 'text', role: 'agent', text: `✅ Booking confirm! ID: ${result.booking_id}. (Demo Mode)` })]);
      setPhase('done');
      setUiState('done');
      return;
    }

    // ── Real mode ─────────────────────────────────────────────────────────────
    if (!pid) return;
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
    handleDirectBook(bid.provider_id, bid.final_price);
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
        // Only hide when actually booking confirmed (bookingResult set), not just phase label
        if (isLoading || (uiState === 'done' && bookingResult !== null)) return null;
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
        if (uiState === 'done' && bookingResult !== null) return null;
        return (
          <View key={item.id} style={styles.biddingWrapper}>
            <BiddingPanel loading={false} result={item.result} onSelectBid={handleSelectBid} />
          </View>
        );

      case 'livebidding': {
        if (uiState === 'done' && bookingResult !== null) return null;
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
                    onPress={() => handleDirectBook(bid.provider_id, bid.final_price)}
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
        if (isLoading || (uiState === 'done' && bookingResult !== null)) return null;
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

      // Case 2: Clarification highlighted card
      case 'clarification':
        return (
          <View key={item.id} style={styles.clarificationCard}>
            <Text style={styles.clarificationLabel}>💬 Thodi aur detail</Text>
            <Text style={styles.clarificationQuestion}>{item.question}</Text>
            <Text style={styles.clarificationHint}>Neeche type karein ya mic se jawab dein</Text>
          </View>
        );

      // Case 1: No provider — waitlist prompt
      case 'waitlist_prompt':
        return (
          <View key={item.id} style={styles.waitlistCard}>
            <Text style={styles.waitlistTitle}>😔 Abhi koi {item.service} available nahi</Text>
            <Text style={styles.waitlistSub}>{item.location ? `— ${item.location}` : ''}</Text>
            {waitlistDone ? (
              <View style={styles.waitlistDoneBadge}>
                <Text style={styles.waitlistDoneText}>✅ Waitlist mein shamil ho gaye!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.waitlistBtn, waitlistLoading && { opacity: 0.6 }]}
                onPress={() => handleVoiceWaitlist(item.service, item.location, item.city, item.intent)}
                disabled={waitlistLoading}
                activeOpacity={0.85}
              >
                {waitlistLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.waitlistBtnText}>🕐 Waitlist mein Shamil Ho</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        );

      // Judge easter egg — closing note card
      case 'judge_note':
        return (
          <View key={item.id} style={styles.judgeCard}>
            {/* Header */}
            <View style={styles.judgeHeader}>
              <Text style={styles.judgeTrophy}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.judgeHeaderTitle}>AI Seekho Hackathon 2026</Text>
                <Text style={styles.judgeHeaderSub}>Closing Note — Haazir AI</Text>
              </View>
            </View>

            {/* Short pitch */}
            <Text style={styles.judgePitch}>
              {'Assalam-o-Alaikum honorable judges!\n\n'}
              {'Haazir AI Pakistan ki informal economy ke liye bana hai — 9 AI agents, Google Antigravity se orchestrated, Gemini 3.5 Flash se powered.\n\n'}
              {'Aap ne humara demo dekha — umeed hai aap ko pasand aaya. 🙏'}
            </Text>

            {/* Agent badges */}
            <View style={styles.judgeAgentsRow}>
              {['SAMAJH','DHUNDHO','CHUNNO','HIFAZAT','HISAAB','PAKKA','MOLTOL','JHAGRA','REPORT'].map((a) => (
                <View key={a} style={styles.judgeAgentBadge}>
                  <Text style={styles.judgeAgentText}>{a}</Text>
                </View>
              ))}
            </View>

            {/* Tech stack */}
            <View style={styles.judgeTechRow}>
              {['Google Antigravity', 'Gemini 3.5 Flash', 'React Native'].map((t) => (
                <View key={t} style={styles.judgeTechBadge}>
                  <Text style={styles.judgeTechText}>{t}</Text>
                </View>
              ))}
            </View>

            {/* Goodbye line */}
            <View style={styles.judgeGoodbye}>
              <Text style={styles.judgeGoodbyeText}>
                AI Seekho Hackathon ke tamam judges ka dil se shukriya!
              </Text>
              <Text style={styles.judgeTagline}>Jo bhi chahiye — bhai Haazir hai! 🙌</Text>
            </View>

            <Text style={styles.judgeFooter}>Made with ❤️ by Team Haazir AI · AI Seekho 2026</Text>
          </View>
        );

      // Case 4: Emergency — no provider at all → 112 call button
      case 'emergency_112':
        return (
          <View key={item.id} style={styles.emergency112Card}>
            <Text style={styles.emergency112Title}>🚨 EMERGENCY</Text>
            <Text style={styles.emergency112Text}>{item.message}</Text>
            <TouchableOpacity
              style={styles.call112Btn}
              onPress={() => Linking.openURL('tel:112')}
              activeOpacity={0.85}
            >
              <Text style={styles.call112Text}>📞 112 Call Karein — Abhi!</Text>
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
            <Text style={styles.searchingText}>Samajh rahi hun...</Text>
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

  // Case 2: Clarification card
  clarificationCard: {
    backgroundColor: Colors.primaryLight, borderRadius: Radius.lg,
    padding: Spacing.md, marginTop: Spacing.xs, marginBottom: Spacing.xs,
    borderWidth: 1, borderColor: Colors.primary,
  },
  clarificationLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  clarificationQuestion: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600', marginBottom: 4 },
  clarificationHint: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Case 1: Waitlist prompt
  waitlistCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginTop: Spacing.xs, marginBottom: Spacing.xs,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
    ...Shadow.sm,
  },
  waitlistTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: 2 },
  waitlistSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  waitlistBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 10, paddingHorizontal: 20, minWidth: 200,
  },
  waitlistBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  waitlistDoneBadge: { backgroundColor: Colors.successDim, borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: 16 },
  waitlistDoneText: { color: Colors.success, fontWeight: '700', fontSize: FontSize.sm },

  // Judge easter egg card
  judgeCard: {
    marginTop: Spacing.sm, marginBottom: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 2, borderColor: Colors.primary,
    overflow: 'hidden',
    ...Shadow.card,
  },
  judgeHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  judgeTrophy: { fontSize: 28 },
  judgeHeaderTitle: { fontSize: FontSize.md, fontWeight: '900', color: '#fff' },
  judgeHeaderSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  judgePitch: {
    fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 21,
    padding: Spacing.md, backgroundColor: Colors.surface,
  },
  judgeAgentsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 5,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  judgeAgentBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: 9, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  judgeAgentText: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.3 },
  judgeTechRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  judgeTechBadge: {
    backgroundColor: '#1a1a2e', borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  judgeTechText: { fontSize: FontSize.xs, color: '#7DF9FF', fontWeight: '700' },
  judgeGoodbye: {
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.primaryDim,
    alignItems: 'center', gap: 4,
  },
  judgeGoodbyeText: {
    fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary,
    textAlign: 'center',
  },
  judgeTagline: {
    fontSize: FontSize.md, fontWeight: '900', color: Colors.primary,
    textAlign: 'center',
  },
  judgeFooter: {
    textAlign: 'center', fontSize: FontSize.xs, color: Colors.textMuted,
    paddingVertical: 10, backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },

  // Case 4: Emergency 112
  emergency112Card: {
    backgroundColor: Colors.dangerDim, borderRadius: Radius.lg,
    padding: Spacing.md, marginTop: Spacing.xs, marginBottom: Spacing.xs,
    borderWidth: 2, borderColor: Colors.danger, alignItems: 'center',
  },
  emergency112Title: { fontSize: FontSize.lg, fontWeight: '900', color: Colors.danger, marginBottom: 4 },
  emergency112Text: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md },
  call112Btn: {
    backgroundColor: Colors.danger, borderRadius: Radius.md,
    paddingVertical: 12, paddingHorizontal: 24,
  },
  call112Text: { color: '#fff', fontSize: FontSize.md, fontWeight: '900' },
});
