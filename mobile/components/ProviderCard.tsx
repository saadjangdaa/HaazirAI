import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { Provider } from '../services/api';

interface Props {
  provider: Provider;
  rank: number;
  onSelect: () => void;
}

export default function ProviderCard({ provider, rank, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);

  const rankColor = rank === 1 ? Colors.primary : rank === 2 ? Colors.warning : Colors.textSecondary;
  const hasWarnings = (provider.warnings?.length || 0) > 0;

  const stars = Math.round(provider.rating);
  const starDisplay = '⭐'.repeat(stars) + '☆'.repeat(5 - stars);

  return (
    <View style={[styles.card, hasWarnings && styles.cardWarning]}>
      {/* Rank Badge */}
      <View style={[styles.rankBadge, { borderColor: rankColor }]}>
        <Text style={[styles.rankText, { color: rankColor }]}>#{rank}</Text>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.name}>{provider.name}</Text>
          <Text style={styles.service}>{provider.service} · {provider.area}</Text>
        </View>
        <View style={styles.headerRight}>
          {provider.verified ? (
            <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✓ Verified</Text></View>
          ) : (
            <View style={styles.unverifiedBadge}><Text style={styles.unverifiedText}>⚠ New</Text></View>
          )}
        </View>
      </View>

      {/* Metrics Row */}
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricIcon}>⭐</Text>
          <Text style={styles.metricValue}>{provider.rating.toFixed(1)}</Text>
          <Text style={styles.metricSub}>({provider.review_count})</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricIcon}>📍</Text>
          <Text style={styles.metricValue}>{provider.distance_km?.toFixed(1) || '?'} km</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricIcon}>💰</Text>
          <Text style={styles.metricValue}>Rs {provider.price_per_hour}/hr</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricIcon}>⏰</Text>
          <Text style={styles.metricValue}>{Math.round((provider.distance_km || 3) * 4 + 10)} min</Text>
        </View>
      </View>

      {/* Trust Score */}
      <View style={styles.trustRow}>
        <Text style={styles.trustLabel}>Trust:</Text>
        <View style={styles.trustBar}>
          <View style={[styles.trustFill, { width: `${provider.trust_score * 100}%` as any, backgroundColor: provider.trust_score >= 0.8 ? Colors.primary : provider.trust_score >= 0.6 ? Colors.warning : Colors.danger }]} />
        </View>
        <Text style={[styles.trustPct, { color: provider.trust_score >= 0.8 ? Colors.primary : provider.trust_score >= 0.6 ? Colors.warning : Colors.danger }]}>
          {Math.round(provider.trust_score * 100)}%
        </Text>
      </View>

      {/* Warnings */}
      {hasWarnings && provider.warnings?.map((w, i) => (
        <Text key={i} style={styles.warning}>{w}</Text>
      ))}

      {/* Ranking Reason Toggle */}
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.reasonToggle}>
        <Text style={styles.reasonToggleText}>
          {expanded ? '🔼 Chhupao' : '🔍 Kyun recommend kiya?'}
        </Text>
      </TouchableOpacity>

      {expanded && provider.ranking_reason_urdu && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonUrdu}>{provider.ranking_reason_urdu}</Text>
          <Text style={styles.reasonEn}>{provider.ranking_reason_english}</Text>
        </View>
      )}

      {/* Score Bar */}
      {provider.ranking_score !== undefined && (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Score:</Text>
          <View style={styles.scoreBar}>
            <View style={[styles.scoreFill, { width: `${Math.round(provider.ranking_score * 100)}%` as any }]} />
          </View>
          <Text style={styles.scoreValue}>{(provider.ranking_score * 100).toFixed(1)}</Text>
        </View>
      )}

      {/* Select Button */}
      <TouchableOpacity style={styles.selectBtn} onPress={onSelect} {...Shadow.card}>
        <Text style={styles.selectBtnText}>✅ Is Provider Ko Chunein</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md, position: 'relative' },
  cardWarning: { borderColor: Colors.warning },
  rankBadge: { position: 'absolute', top: Spacing.md, right: Spacing.md, borderRadius: Radius.full, borderWidth: 2, paddingHorizontal: 8, paddingVertical: 2 },
  rankText: { fontSize: FontSize.sm, fontWeight: '800' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm, paddingRight: 50 },
  headerLeft: { flex: 1 },
  headerRight: {},
  name: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', marginBottom: 2 },
  service: { color: Colors.textSecondary, fontSize: FontSize.sm },
  verifiedBadge: { backgroundColor: Colors.primaryDim, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  verifiedText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '700' },
  unverifiedBadge: { backgroundColor: Colors.warningDim, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  unverifiedText: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: '700' },
  metrics: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  metric: { flex: 1, alignItems: 'center' },
  metricIcon: { fontSize: 12, marginBottom: 1 },
  metricValue: { color: Colors.textPrimary, fontSize: FontSize.xs, fontWeight: '700' },
  metricSub: { color: Colors.textMuted, fontSize: 10 },
  metricDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  trustRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  trustLabel: { color: Colors.textMuted, fontSize: FontSize.xs, width: 40 },
  trustBar: { flex: 1, height: 5, backgroundColor: Colors.border, borderRadius: 3 },
  trustFill: { height: 5, borderRadius: 3 },
  trustPct: { fontSize: FontSize.xs, fontWeight: '700', width: 35, textAlign: 'right' },
  warning: { color: Colors.warning, fontSize: FontSize.xs, backgroundColor: Colors.warningDim, borderRadius: Radius.sm, padding: 6, marginBottom: 4 },
  reasonToggle: { paddingVertical: Spacing.xs },
  reasonToggleText: { color: Colors.textMuted, fontSize: FontSize.xs },
  reasonBox: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm, marginTop: 4, marginBottom: Spacing.sm },
  reasonUrdu: { color: Colors.primary, fontSize: FontSize.sm, marginBottom: 4, lineHeight: 20 },
  reasonEn: { color: Colors.textMuted, fontSize: FontSize.xs, fontStyle: 'italic' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  scoreLabel: { color: Colors.textMuted, fontSize: FontSize.xs, width: 42 },
  scoreBar: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  scoreFill: { height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  scoreValue: { color: Colors.textSecondary, fontSize: FontSize.xs, width: 30, textAlign: 'right' },
  selectBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.sm + 2, alignItems: 'center', marginTop: Spacing.xs },
  selectBtnText: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '700' },
});
