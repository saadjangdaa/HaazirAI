import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToChat, sendChatMessage, workerUpdateStatus,
  ChatDoc, ChatMessage, ChatStatus,
} from '../services/chatService';

const WORKER_STATUS_ACTIONS: { status: ChatStatus; label: string; icon: string; color: string }[] = [
  { status: 'on_the_way',  label: 'Rawaana Ho Gaya',  icon: 'car-outline',              color: Colors.primary },
  { status: 'arrived',     label: 'Pahunch Gaya',      icon: 'location-outline',         color: Colors.primary },
  { status: 'in_progress', label: 'Kaam Shuru Karo',   icon: 'construct-outline',        color: Colors.workerAccent },
  { status: 'completed',   label: 'Kaam Mukammal',     icon: 'checkmark-circle-outline', color: Colors.success },
];

const STATUS_LABEL: Record<ChatStatus, string> = {
  waiting:     'Customer ka intezaar...',
  accepted:    'Job Accept Ki!',
  on_the_way:  'Rawaana Ho Gaye',
  arrived:     'Pahunch Gaye',
  in_progress: 'Kaam Chal Raha Hai',
  completed:   'Kaam Mukammal!',
  cancelled:   'Cancel Ho Gaya',
};

export default function WorkerChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { jobRequestId, customerName, service } = useLocalSearchParams<{
    jobRequestId: string;
    customerName: string;
    service: string;
  }>();

  const [chat, setChat] = useState<ChatDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!jobRequestId) return;
    const unsub = subscribeToChat(jobRequestId, (doc) => {
      setChat(doc);
      setLoading(false);
    });
    return unsub;
  }, [jobRequestId]);

  useEffect(() => {
    if (chat?.messages?.length) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chat?.messages?.length]);

  const handleSend = async () => {
    const text = msgText.trim();
    if (!text || !jobRequestId || !user?.id) return;
    setSending(true);
    setMsgText('');
    try {
      const name = chat?.worker_name || user.username?.split('_')[0] || 'Worker';
      await sendChatMessage(jobRequestId, 'worker', name, text);
    } catch {
      setMsgText(text);
    } finally {
      setSending(false);
    }
  };

  const handleStatusUpdate = async (newStatus: ChatStatus) => {
    if (!jobRequestId) return;
    setUpdatingStatus(true);
    try {
      const workerName = chat?.worker_name || user?.username?.split('_')[0] || 'Worker';
      await workerUpdateStatus(jobRequestId, workerName, newStatus);
    } catch (e) {
      console.warn('[WorkerChat] status update failed:', e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const status = chat?.status || 'accepted';
  const displayCustomer = chat?.customer_name || customerName || 'Customer';
  const displayService = chat?.service || service || 'Service';
  const messages: ChatMessage[] = chat?.messages || [];

  // Find next action based on current status
  const statusOrder: ChatStatus[] = ['accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'];
  const currentIdx = statusOrder.indexOf(status);
  const nextAction = WORKER_STATUS_ACTIONS.find((a) => statusOrder.indexOf(a.status) > currentIdx && statusOrder.indexOf(a.status) <= currentIdx + 1);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chat load ho raha hai...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.workerAccent} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.customerAvatar}>
            <Text style={styles.customerAvatarText}>{displayCustomer.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{displayCustomer}</Text>
            <Text style={styles.headerService}>{displayService} · {STATUS_LABEL[status]}</Text>
          </View>
        </View>
      </View>

      {/* Status action button */}
      {nextAction && status !== 'completed' && status !== 'cancelled' && (
        <TouchableOpacity
          style={[styles.statusActionBtn, { backgroundColor: nextAction.color }, updatingStatus && { opacity: 0.6 }]}
          onPress={() => handleStatusUpdate(nextAction.status)}
          disabled={updatingStatus}
          activeOpacity={0.85}
        >
          {updatingStatus
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name={nextAction.icon as any} size={18} color="#fff" />}
          <Text style={styles.statusActionText}>{nextAction.label}</Text>
        </TouchableOpacity>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.msgList}
        contentContainerStyle={[styles.msgContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} myRole="worker" />
        ))}
      </ScrollView>

      {/* Input */}
      {status !== 'completed' && status !== 'cancelled' && (
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={msgText}
            onChangeText={setMsgText}
            placeholder="Customer ko kuch kehna hai..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={200}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!msgText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!msgText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ msg, myRole }: { msg: ChatMessage; myRole: 'customer' | 'worker' }) {
  if (msg.sender_role === 'system') {
    return (
      <View style={styles.systemMsgWrap}>
        <Text style={styles.systemMsg}>{msg.text}</Text>
      </View>
    );
  }
  const isMine = msg.sender_role === myRole;
  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      {!isMine && (
        <View style={styles.bubbleAvatar}>
          <Text style={styles.bubbleAvatarText}>{msg.sender_name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {!isMine && <Text style={styles.bubbleSender}>{msg.sender_name}</Text>}
        <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{msg.text}</Text>
        <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
          {new Date(msg.ts).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: Colors.background },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted },

  header: {
    backgroundColor: Colors.workerAccent,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  customerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  customerAvatarText: { fontSize: FontSize.md, fontWeight: FontWeight.black, color: '#fff' },
  headerName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },
  headerService: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)' },

  statusActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.md, marginVertical: Spacing.sm,
    borderRadius: Radius.lg, ...Shadow.sm,
  },
  statusActionText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },

  msgList: { flex: 1 },
  msgContent: { padding: Spacing.md, gap: 8 },

  systemMsgWrap: { alignItems: 'center', marginVertical: 4 },
  systemMsg: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
    textAlign: 'center',
  },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 2 },
  bubbleRowMine: { flexDirection: 'row-reverse' },
  bubbleAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.workerAccentDim,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  bubbleAvatarText: { fontSize: 11, fontWeight: FontWeight.black, color: Colors.workerAccent },
  bubble: { maxWidth: '72%', borderRadius: Radius.lg, padding: Spacing.sm, ...Shadow.sm },
  bubbleMine: { backgroundColor: Colors.workerAccent, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: Colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.border },
  bubbleSender: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.workerAccent, marginBottom: 2 },
  bubbleText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 19 },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: Colors.textMuted, marginTop: 3, textAlign: 'right' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.65)' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 100,
    backgroundColor: Colors.inputBg, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: FontSize.sm, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.workerAccent,
    justifyContent: 'center', alignItems: 'center', ...Shadow.sm,
  },
  sendBtnDisabled: { backgroundColor: Colors.border },
});
