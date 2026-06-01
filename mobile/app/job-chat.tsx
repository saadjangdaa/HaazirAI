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
  subscribeToChat, sendChatMessage,
  ChatDoc, ChatMessage, ChatStatus,
} from '../services/chatService';

const STATUS_CONFIG: Record<ChatStatus, { label: string; color: string; bg: string; icon: string }> = {
  waiting:     { label: 'Worker ka intezaar...',    color: Colors.warning,   bg: Colors.warningDim,   icon: 'time-outline' },
  accepted:    { label: 'Worker ne accept kar liya!', color: Colors.success, bg: Colors.successDim,   icon: 'checkmark-circle-outline' },
  on_the_way:  { label: 'Worker rawaana ho gaya',   color: Colors.primary,   bg: Colors.primaryDim,   icon: 'car-outline' },
  arrived:     { label: 'Worker pahunch gaya!',     color: Colors.success,   bg: Colors.successDim,   icon: 'location-outline' },
  in_progress: { label: 'Kaam chal raha hai',       color: Colors.primary,   bg: Colors.primaryDim,   icon: 'construct-outline' },
  completed:   { label: 'Kaam mukammal!',           color: Colors.success,   bg: Colors.successDim,   icon: 'checkmark-done-circle-outline' },
  cancelled:   { label: 'Cancel ho gaya',           color: Colors.danger,    bg: Colors.dangerDim,    icon: 'close-circle-outline' },
};

export default function JobChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { jobRequestId, workerName, service } = useLocalSearchParams<{
    jobRequestId: string;
    workerName: string;
    service: string;
  }>();

  const [chat, setChat] = useState<ChatDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
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
      const name = user.username?.split('_')[0] || 'Customer';
      await sendChatMessage(jobRequestId, 'customer', name, text);
    } catch {
      setMsgText(text);
    } finally {
      setSending(false);
    }
  };

  const status = chat?.status || 'waiting';
  const cfg = STATUS_CONFIG[status];
  const displayWorker = chat?.worker_name || workerName || 'Worker';
  const displayService = chat?.service || service || 'Service';
  const messages: ChatMessage[] = chat?.messages || [];

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
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.workerAvatar}>
            <Text style={styles.workerAvatarText}>{displayWorker.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{displayWorker}</Text>
            <Text style={styles.headerService} numberOfLines={1}>{displayService}</Text>
          </View>
        </View>
      </View>

      {/* Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon as any} size={15} color={cfg.color} />
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        {status === 'waiting' && (
          <ActivityIndicator size="small" color={cfg.color} style={{ marginLeft: 'auto' }} />
        )}
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.msgList}
        contentContainerStyle={[styles.msgContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubbles-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyChatText}>Chat shuru ho rahi hai...</Text>
          </View>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} myRole="customer" />
        ))}
      </ScrollView>

      {/* Input — only show when chat is active */}
      {status !== 'completed' && status !== 'cancelled' && (
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={msgText}
            onChangeText={setMsgText}
            placeholder="Koi baat karni hai worker se..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={200}
            onSubmitEditing={handleSend}
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

      {status === 'completed' && (
        <View style={[styles.doneBar, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.doneText}>Kaam mukammal! Feedback dein</Text>
          <TouchableOpacity
            style={styles.feedbackBtn}
            onPress={() => router.push({ pathname: '/feedback', params: { bookingId: jobRequestId } })}
          >
            <Text style={styles.feedbackBtnText}>Review Dein</Text>
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
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  workerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  workerAvatarText: { fontSize: FontSize.md, fontWeight: FontWeight.black, color: '#fff' },
  headerName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },
  headerService: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)' },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statusText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  msgList: { flex: 1 },
  msgContent: { padding: Spacing.md, gap: 8 },

  emptyChat: { alignItems: 'center', gap: 8, marginTop: 60 },
  emptyChatText: { fontSize: FontSize.sm, color: Colors.textMuted },

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
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  bubbleAvatarText: { fontSize: 11, fontWeight: FontWeight.black, color: Colors.primary },
  bubble: {
    maxWidth: '72%', borderRadius: Radius.lg, padding: Spacing.sm,
    ...Shadow.sm,
  },
  bubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  bubbleSender: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: 2 },
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
    flex: 1,
    minHeight: 40, maxHeight: 100,
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: FontSize.sm, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.sm,
  },
  sendBtnDisabled: { backgroundColor: Colors.border },

  doneBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  doneText: { fontSize: FontSize.sm, color: Colors.success, fontWeight: FontWeight.semibold },
  feedbackBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  feedbackBtnText: { fontSize: FontSize.sm, color: '#fff', fontWeight: FontWeight.bold },
});
