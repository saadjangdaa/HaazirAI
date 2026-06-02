import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../constants/theme';
import type { ChatDoc } from '../services/chatService';
import {
  triggerLateArrivalPrompts,
  workerSubmitLateNote,
  customerSetWaitDecision,
} from '../services/chatService';
import { runCustomerRebook } from '../services/rebookFlow';
import { getEtaState, formatEtaCountdown } from '../utils/arrivalEta';

interface Props {
  chat: ChatDoc;
  jobRequestId: string;
  role: 'customer' | 'worker';
  displayName: string;
  /** Customer moved to new worker chat after rebook */
  onRebookSuccess?: (newJobRequestId: string, newWorkerName: string) => void;
}

export function ArrivalEtaPanel({ chat, jobRequestId, role, displayName, onRebookSuccess }: Props) {
  const [tick, setTick] = useState(0);
  const [lateNote, setLateNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (chat.status !== 'on_the_way') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [chat.status]);

  const eta = getEtaState(chat);
  void tick;

  useEffect(() => {
    if (!eta?.isOverdue || chat.late_prompt_at || promptedRef.current) return;
    if (chat.status !== 'on_the_way') return;
    promptedRef.current = true;
    triggerLateArrivalPrompts(jobRequestId, chat.worker_name || 'Worker').catch(() => {
      promptedRef.current = false;
    });
  }, [eta?.isOverdue, chat.late_prompt_at, chat.status, jobRequestId, chat.worker_name]);

  if (chat.status !== 'on_the_way' || !eta) return null;

  const showLateFlow = eta.isOverdue && Boolean(chat.late_prompt_at);
  const workerName = chat.worker_name || 'Worker';

  const handleLateNote = async () => {
    const text = lateNote.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      await workerSubmitLateNote(jobRequestId, displayName, text);
      setLateNote('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWait = async () => {
    if (chat.customer_wait_decision) return;
    setDeciding(true);
    try {
      await customerSetWaitDecision(jobRequestId, displayName, 'waiting');
    } finally {
      setDeciding(false);
    }
  };

  const handleRebook = async () => {
    if (chat.customer_wait_decision) return;
    setDeciding(true);
    try {
      const result = await runCustomerRebook({
        chat,
        jobRequestId,
        customerName: displayName,
      });
      if (result.ok && result.newJobRequestId) {
        onRebookSuccess?.(result.newJobRequestId, result.workerName);
      }
    } finally {
      setDeciding(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {/* Countdown banner */}
      {!showLateFlow && (
        <View style={[styles.etaBanner, eta.isOverdue && styles.etaBannerLate]}>
          <Ionicons
            name={eta.isOverdue ? 'alert-circle-outline' : 'time-outline'}
            size={18}
            color={eta.isOverdue ? Colors.warning : Colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.etaTitle}>
              {role === 'customer'
                ? `${workerName} aa raha hai`
                : 'Aap rawaana ho chuke hain'}
            </Text>
            <Text style={[styles.etaSub, eta.isOverdue && styles.etaSubLate]}>
              {formatEtaCountdown(eta)}
            </Text>
          </View>
          {!eta.isOverdue && (
            <View style={styles.etaPill}>
              <Text style={styles.etaPillText}>
                {eta.useSeconds ? `${eta.secondsLeft} sec` : `${eta.minutesLeft} min`}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Worker late note shown to customer */}
      {role === 'customer' && chat.late_worker_note && (
        <View style={styles.workerNoteBox}>
          <Text style={styles.workerNoteLabel}>{workerName} ka message:</Text>
          <Text style={styles.workerNoteText}>{chat.late_worker_note}</Text>
        </View>
      )}

      {/* Late flow — worker */}
      {showLateFlow && role === 'worker' && !chat.late_worker_note && (
        <View style={styles.latePanel}>
          <Text style={styles.lateTitle}>Der ho gayi?</Text>
          <Text style={styles.lateHint}>
            Customer ko batayein — kyun late hain ya kitni der aur lagay gi?
          </Text>
          <TextInput
            style={styles.lateInput}
            value={lateNote}
            onChangeText={setLateNote}
            placeholder="Masalan: traffic hai, 10 min aur lagenge"
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={200}
          />
          <TouchableOpacity
            style={[styles.lateBtn, (!lateNote.trim() || submitting) && styles.lateBtnDisabled]}
            onPress={handleLateNote}
            disabled={!lateNote.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.lateBtnText}>Message bhejein</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Late flow — customer */}
      {showLateFlow && role === 'customer' && !chat.customer_wait_decision && (
        <View style={styles.latePanel}>
          <Text style={styles.lateTitle}>Worker abhi tak nahi pahunche</Text>
          <Text style={styles.lateHint}>
            Kya aap intezaar karna chahte hain ya naya worker dhundhein?
          </Text>
          <View style={styles.decisionRow}>
            <TouchableOpacity
              style={[styles.waitBtn, deciding && { opacity: 0.6 }]}
              onPress={handleWait}
              disabled={deciding}
            >
              <Ionicons name="hourglass-outline" size={16} color={Colors.primary} />
              <Text style={styles.waitBtnText}>Intezaar karein</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rebookBtn, deciding && { opacity: 0.6 }]}
              onPress={handleRebook}
              disabled={deciding}
            >
              {deciding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color="#fff" />
                  <Text style={styles.rebookBtnText}>Naya worker</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {chat.customer_wait_decision === 'waiting' && (
        <View style={styles.decisionDone}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          <Text style={styles.decisionDoneText}>Customer intezaar kar raha hai</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.primaryDim,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  etaBannerLate: { backgroundColor: Colors.warningDim },
  etaTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  etaSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  etaSubLate: { color: Colors.warning, fontWeight: FontWeight.semibold },
  etaPill: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  etaPillText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#fff' },

  workerNoteBox: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  workerNoteLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: 4 },
  workerNoteText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 18 },

  latePanel: {
    margin: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  lateTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 4 },
  lateHint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm, lineHeight: 18 },
  lateInput: {
    minHeight: 56,
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  lateBtn: {
    backgroundColor: Colors.workerAccent,
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  lateBtnDisabled: { opacity: 0.5 },
  lateBtnText: { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },

  decisionRow: { flexDirection: 'row', gap: Spacing.sm },
  waitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
  },
  waitBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  rebookBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.warning,
  },
  rebookBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },

  decisionDone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: Colors.successDim,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  decisionDoneText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.success },
});
