import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';
import { AgentLog } from '../services/api';

interface Props {
  logs: AgentLog[];
  expanded?: boolean;
}

const AGENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SAMAJH:  { bg: '#E6FAF5', border: '#00A37A', text: '#007A5C' },
  DHUNDHO: { bg: '#E0F2FE', border: '#0284C7', text: '#0369A1' },
  CHUNNO:  { bg: '#F0FDF4', border: '#16A34A', text: '#15803D' },
  HIFAZAT: { bg: '#FFF7ED', border: '#EA580C', text: '#C2410C' },
  HISAAB:  { bg: '#FAF5FF', border: '#9333EA', text: '#7E22CE' },
  PAKKA:   { bg: '#ECFDF5', border: '#059669', text: '#047857' },
  MOLTOL:  { bg: '#FFFBEB', border: '#D97706', text: '#B45309' },
  JHAGRA:  { bg: '#FEF2F2', border: '#DC2626', text: '#B91C1C' },
  REPORT:  { bg: '#ECFEFF', border: '#0891B2', text: '#0E7490' },
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? Colors.primary : pct >= 70 ? Colors.warning : Colors.danger;
  return (
    <View style={barStyles.container}>
      <View style={[barStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      <Text style={[barStyles.label, { color }]}>{pct}%</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { height: 6, backgroundColor: Colors.border, borderRadius: 3, marginTop: 4, position: 'relative' },
  fill: { height: 6, borderRadius: 3 },
  label: { position: 'absolute', right: 0, top: -14, fontSize: FontSize.xs, fontWeight: '700' },
});

function LogCard({ log, index }: { log: AgentLog; index: number }) {
  const [open, setOpen] = useState(false);
  const theme = AGENT_COLORS[log.agent_name] || { bg: Colors.cardBg, border: Colors.border, text: Colors.primary };
  const elapsed = log.time_seconds?.toFixed(3) + 's';

  const startTime = log.start_time ? new Date(log.start_time).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border }]}
      onPress={() => setOpen(!open)}
      activeOpacity={0.85}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.stepBadge, { backgroundColor: theme.border + '33' }]}>
            <Text style={[styles.stepNum, { color: theme.text }]}>{index + 1}</Text>
          </View>
          <View>
            <Text style={[styles.agentName, { color: theme.text }]}>{log.agent_name}</Text>
            <Text style={styles.agentNameUrdu}>{log.agent_name_urdu}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.timeText}>{startTime}</Text>
          <Text style={styles.elapsedText}>{elapsed}</Text>
          {log.fallback_used && <Text style={styles.fallbackBadge}>⚠ FALLBACK</Text>}
          <Text style={[styles.chevron, { color: theme.text }]}>{open ? '▲' : '▼'}</Text>
        </View>
      </View>

      {/* Confidence */}
      <View style={styles.confidenceRow}>
        <Text style={styles.confidenceLabel}>Confidence:</Text>
        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
          <ConfidenceBar value={log.confidence} />
        </View>
      </View>

      {/* Collapsed preview */}
      {!open && (
        <Text style={styles.decisionPreview} numberOfLines={1}>
          → {log.decision_made}
        </Text>
      )}

      {/* Expanded details */}
      {open && (
        <View style={styles.expandedBody}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Input:</Text>
            <Text style={styles.detailValue}>{log.input_summary}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Output:</Text>
            <Text style={[styles.detailValue, { color: theme.text }]}>{log.output_summary}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Decision:</Text>
            <Text style={styles.detailValue}>{log.decision_made}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function AgentLogViewer({ logs, expanded = false }: Props) {
  if (!logs || logs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Koi logs nahi milein — pehle request bhejein</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🤖 Agent Reasoning Pipeline</Text>
      {logs.map((log, i) => (
        <LogCard key={log.agent_name + i} log={log} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: Spacing.sm },
  title: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: Spacing.sm, letterSpacing: 1 },
  card: { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, marginBottom: Spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  stepNum: { fontSize: FontSize.sm, fontWeight: '800' },
  agentName: { fontSize: FontSize.md, fontWeight: '800', letterSpacing: 1 },
  agentNameUrdu: { fontSize: FontSize.sm, color: Colors.textMuted },
  headerRight: { alignItems: 'flex-end', gap: 2 },
  timeText: { color: Colors.textMuted, fontSize: FontSize.xs },
  elapsedText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  fallbackBadge: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: '700' },
  chevron: { fontSize: FontSize.xs, marginTop: 2 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  confidenceLabel: { color: Colors.textMuted, fontSize: FontSize.xs, width: 80 },
  decisionPreview: { color: Colors.textMuted, fontSize: FontSize.xs, fontStyle: 'italic', marginTop: 4 },
  expandedBody: { marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border + '44', paddingTop: Spacing.sm },
  detailRow: { marginBottom: Spacing.sm },
  detailLabel: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 2 },
  detailValue: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 18 },
  separator: { height: 1, backgroundColor: Colors.border + '33', marginVertical: Spacing.xs },
  empty: { padding: Spacing.xl, alignItems: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
