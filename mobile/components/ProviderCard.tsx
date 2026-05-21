import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { Provider } from '../services/api';

interface Props {
  provider: Provider;
  rank: number;
  onSelect: () => void;
}

const RANK_COLORS = ['#1A6FFF', '#FF9500', '#34C759'];
const RANK_LABELS = ['Best Match', '2nd', '3rd'];

export default function ProviderCard({ provider, rank, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);

  const rankColor = RANK_COLORS[rank - 1] || Colors.textMuted;
  const hasWarnings = (provider.warnings?.length || 0) > 0;
  const trustScore = provider.trust_score || 0;
  const trustColor = trustScore >= 0.8 ? Colors.success : trustScore >= 0.6 ? Colors.warning : Colors.danger;

  const arrivalMin = Math.round((provider.distance_km || 3) * 4 + 10);

  return (
    <View style={[styles.card, Shadow.card, rank === 1 && styles.cardTop, hasWarnings && styles.cardWarning]}>

      {/* Rank badge */}
      {rank <= 3 && (
        <View style={[styles.rankBadge, { backgroundColor: rankColor + '18', borderColor: rankColor }]}>
          {rank === 1 && <Ionicons name="trophy" size={10} color={rankColor} />}
          <Text style={[styles.rankText, { color: rankColor }]}>{RANK_LABELS[rank - 1] || `#${rank}`}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={22} color={Colors.primary} />
        </View>
        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{provider.name}</Text>
            {provider.verified && (
              <Ionicons name="shield-checkmark" size={14} color={Colors.primary} style={{ marginLeft: 4 }} />
            )}
            {!provider.verified && (
              <View style={styles.newBadge}><Text style={styles.newBadgeText}>New</Text></View>
            )}
          </View>
          <Text style={styles.service}>{provider.service} · {provider.area}, {provider.city}</Text>
        </View>
      </View>

      {/* Metrics strip */}
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Ionicons name="star" size={13} color={Colors.warning} />
          <Text style={styles.metricValue}>{provider.rating.toFixed(1)}</Text>
          <Text style={styles.metricSub}>({provider.review_count})</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.metricValue}>{provider.distance_km?.toFixed(1) || '?'} km</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Ionicons name="cash-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.metricValue}>Rs {provider.price_per_hour}/hr</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.metricValue}>{arrivalMin} min</Text>
        </View>
      </View>

      {/* Trust score */}
      <View style={styles.trustRow}>
        <Text style={styles.trustLabel}>Trust</Text>
        <View style={styles.trustBarBg}>
          <View style={[styles.trustBarFill, { width: `${trustScore * 100}%` as any, backgroundColor: trustColor }]} />
        </View>
        <Text style={[styles.trustPct, { color: trustColor }]}>{Math.round(trustScore * 100)}%</Text>
      </View>

      {/* Warnings */}
      {hasWarnings && provider.warnings?.map((w, i) => (
        <View key={i} style={styles.warningRow}>
          <Ionicons name="warning-outline" size={12} color={Colors.warning} />
          <Text style={styles.warningText}>{w}</Text>
        </View>
      ))}

      {/* Why recommended toggle */}
      <TouchableOpacity style={styles.reasonToggle} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <Ionicons name={expanded ? 'chevron-up' : 'information-circle-outline'} size={14} color={Colors.primary} />
        <Text style={styles.reasonToggleText}>{expanded ? 'Chhupao' : 'Kyun recommend kiya?'}</Text>
      </TouchableOpacity>

      {expanded && provider.ranking_reason_urdu && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonUrdu}>{provider.ranking_reason_urdu}</Text>
          {provider.ranking_reason_english && (
            <Text style={styles.reasonEn}>{provider.ranking_reason_english}</Text>
          )}
        </View>
      )}

      {/* Score bar */}
      {provider.ranking_score !== undefined && (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>AI Score</Text>
          <View style={styles.scoreBarBg}>
            <View style={[styles.scoreBarFill, { width: `${Math.round(provider.ranking_score * 100)}%` as any }]} />
          </View>
          <Text style={styles.scoreValue}>{(provider.ranking_score * 100).toFixed(0)}</Text>
        </View>
      )}

      {/* Select CTA */}
      <TouchableOpacity style={styles.selectBtn} onPress={onSelect} activeOpacity={0.85}>
        <Text style={styles.selectBtnText}>Book Karein</Text>
        <Ionicons name="arrow-forward" size={16} color={Colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  cardTop: { borderColor: Colors.primaryDim, borderWidth: 1.5 },
  cardWarning: { borderColor: Colors.warning },

  rankBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    borderRadius: Radius.full, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: Spacing.sm,
  },
  rankText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  newBadge: { marginLeft: 6, backgroundColor: Colors.warningDim, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  newBadgeText: { fontSize: 10, color: Colors.warning, fontWeight: FontWeight.bold },
  service: { fontSize: FontSize.xs, color: Colors.textMuted },

  metrics: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.inputBg, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.sm },
  metric: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: 'center', flexWrap: 'wrap' },
  metricValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  metricSub: { fontSize: 10, color: Colors.textMuted },
  metricDivider: { width: 1, height: 24, backgroundColor: Colors.border },

  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  trustLabel: { fontSize: FontSize.xs, color: Colors.textMuted, width: 36 },
  trustBarBg: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3 },
  trustBarFill: { height: 6, borderRadius: 3 },
  trustPct: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, width: 32, textAlign: 'right' },

  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warningDim, borderRadius: Radius.sm, padding: 6, marginBottom: 4 },
  warningText: { color: Colors.warning, fontSize: FontSize.xs, flex: 1 },

  reasonToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: Spacing.xs },
  reasonToggleText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  reasonBox: { backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing.sm, marginVertical: Spacing.xs },
  reasonUrdu: { color: Colors.primary, fontSize: FontSize.sm, marginBottom: 4, lineHeight: 20 },
  reasonEn: { color: Colors.textMuted, fontSize: FontSize.xs, fontStyle: 'italic' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  scoreLabel: { fontSize: FontSize.xs, color: Colors.textMuted, width: 50 },
  scoreBarBg: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  scoreBarFill: { height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  scoreValue: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.bold, width: 24, textAlign: 'right' },

  selectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    height: 46, marginTop: Spacing.xs,
  },
  selectBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
