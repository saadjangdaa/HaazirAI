import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserVoiceSessions, VoiceSessionSummary } from '../services/chatService';

const PHASE_LABEL: Record<string, string> = {
  intake: 'Baat ho rahi thi',
  searching: 'Workers dhoondh rahe the',
  confirming: 'Provider chun rahe the',
  booking: 'Booking ho rahi thi',
  done: 'Mukammal',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Abhi';
  if (mins < 60) return `${mins} min pehle`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ghante pehle`;
  const days = Math.floor(hrs / 24);
  return `${days} din pehle`;
}

export const options = { headerShown: false };

export default function VoiceChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [sessions, setSessions] = useState<VoiceSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    const unsub = subscribeToUserVoiceSessions(user.id, (s) => {
      setSessions(s);
      setLoading(false);
    });
    return unsub;
  }, [user?.id]);

  const handleResume = (session: VoiceSessionSummary) => {
    router.push({
      pathname: '/voice-conversation',
      params: { resumeSessionId: session.session_id },
    });
  };

  const handleNew = () => {
    router.push('/voice-conversation');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meri Chats</Text>
        <TouchableOpacity style={styles.newBtn} onPress={handleNew} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={56} color={Colors.border} />
          <Text style={styles.emptyTitle}>Koi chat nahi abhi tak</Text>
          <Text style={styles.emptySub}>Voice agent se baat karein — chat yahan save hogi</Text>
          <TouchableOpacity style={styles.startBtn} onPress={handleNew} activeOpacity={0.85}>
            <Ionicons name="mic-outline" size={18} color="#fff" />
            <Text style={styles.startBtnText}>Nai Chat Shuru Karein</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.newChatCard} onPress={handleNew} activeOpacity={0.85}>
            <View style={styles.newChatIcon}>
              <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
            </View>
            <Text style={styles.newChatText}>Nai Chat Shuru Karein</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Purani Chats</Text>

          {sessions.map((s) => (
            <TouchableOpacity
              key={s.session_id}
              style={[styles.chatCard, Shadow.sm]}
              onPress={() => handleResume(s)}
              activeOpacity={0.85}
            >
              <View style={[styles.chatIcon, s.status === 'completed' ? styles.chatIconDone : styles.chatIconActive]}>
                <Ionicons
                  name={s.status === 'completed' ? 'checkmark-circle-outline' : 'mic-outline'}
                  size={20}
                  color={s.status === 'completed' ? Colors.success : Colors.primary}
                />
              </View>
              <View style={styles.chatInfo}>
                <Text style={styles.chatTitle} numberOfLines={1}>{s.title}</Text>
                <Text style={styles.chatPreview} numberOfLines={1}>
                  {s.last_message || PHASE_LABEL[s.phase] || 'Voice chat'}
                </Text>
                <Text style={styles.chatTime}>{timeAgo(s.updated_at)}</Text>
              </View>
              <View style={styles.chatRight}>
                {s.status === 'completed' ? (
                  <View style={styles.doneBadge}>
                    <Text style={styles.doneBadgeText}>Mukammal</Text>
                  </View>
                ) : (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Resume</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} style={{ marginTop: 4 }} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: '#fff' },
  newBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: Spacing.xl },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    ...Shadow.primary,
  },
  startBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },

  list: { flex: 1 },
  listContent: { padding: Spacing.md, gap: Spacing.sm },

  newChatCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary,
    marginBottom: Spacing.xs,
  },
  newChatIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  newChatText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },

  sectionLabel: {
    fontSize: FontSize.xs, fontWeight: FontWeight.semibold,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: Spacing.sm, marginBottom: Spacing.xs,
  },

  chatCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  chatIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  chatIconActive: { backgroundColor: Colors.primaryDim },
  chatIconDone: { backgroundColor: Colors.successDim },
  chatInfo: { flex: 1, gap: 3 },
  chatTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  chatPreview: { fontSize: FontSize.xs, color: Colors.textMuted },
  chatTime: { fontSize: 10, color: Colors.textMuted },
  chatRight: { alignItems: 'flex-end', gap: 2 },
  doneBadge: {
    backgroundColor: Colors.successDim,
    borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  doneBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success },
  activeBadge: {
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  activeBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary },
});
