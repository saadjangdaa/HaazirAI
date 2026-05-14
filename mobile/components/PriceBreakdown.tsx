import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';
import { PriceBreakdown as PriceBreakdownType } from '../services/api';

interface Props {
  pricing: PriceBreakdownType;
}

export default function PriceBreakdown({ pricing }: Props) {
  const [expanded, setExpanded] = useState(false);

  const rows = [
    { label: 'Base Price', value: pricing.base_price, icon: '🔧', positive: false },
    { label: 'Distance Cost', value: pricing.distance_cost, icon: '📍', positive: false },
    { label: 'Urgency Adjustment', value: pricing.urgency_adjustment, icon: '⚡', positive: false },
    { label: 'Complexity Fee', value: pricing.complexity_fee, icon: '⚙️', positive: false },
    { label: 'Surge Pricing', value: pricing.surge_pricing, icon: '📈', positive: false },
    { label: 'Loyalty Discount', value: pricing.loyalty_discount, icon: '🎁', positive: true },
  ].filter((r) => r.value !== 0);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(!expanded)}>
        <Text style={styles.title}>💰 Price Breakdown</Text>
        <View style={styles.totalBadge}>
          <Text style={styles.totalText}>Rs {pricing.total.toLocaleString()}</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {rows.map((row, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.rowIcon}>{row.icon}</Text>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, row.positive && styles.rowValueDiscount]}>
                {row.positive ? '-' : '+'} Rs {Math.abs(row.value).toLocaleString()}
              </Text>
            </View>
          ))}

          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>Rs {pricing.total.toLocaleString()}</Text>
          </View>

          <Text style={styles.fairnessNote}>{pricing.fairness_note}</Text>

          {pricing.budget_alternative && (
            <View style={styles.altCard}>
              <Text style={styles.altTitle}>💡 Sasta Option:</Text>
              <Text style={styles.altText}>
                {pricing.budget_alternative.provider} — Rs {pricing.budget_alternative.total.toLocaleString()}
              </Text>
              <Text style={styles.altTradeoff}>⚠ {pricing.budget_alternative.tradeoff}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  title: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  totalBadge: { backgroundColor: Colors.primaryDim, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  totalText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '800' },
  chevron: { color: Colors.textMuted, fontSize: FontSize.xs },
  body: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowIcon: { fontSize: 14, width: 22 },
  rowLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1 },
  rowValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  rowValueDiscount: { color: Colors.primary },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '700' },
  totalValue: { color: Colors.primary, fontSize: FontSize.xxl, fontWeight: '900' },
  fairnessNote: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.sm, fontStyle: 'italic' },
  altCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm, marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  altTitle: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: '700', marginBottom: 2 },
  altText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  altTradeoff: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
});
