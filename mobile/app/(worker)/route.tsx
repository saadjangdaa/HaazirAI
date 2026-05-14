import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';

const STOPS = [
  { n: 1, time: '10:00 AM', who: 'Ahmed', area: 'G-13', dist: '1.8km', svc: 'AC Repair' },
  { n: 2, time: '12:30 PM', who: 'Fatima', area: 'G-10', dist: '2.1km', svc: 'AC Service' },
  { n: 3, time: '3:00 PM', who: 'Bilal', area: 'F-7', dist: '3.4km', svc: 'Electrician' },
];

const DOT_POSITIONS = [
  { x: '12%', y: '22%' },
  { x: '52%', y: '48%' },
  { x: '82%', y: '76%' },
];

export default function WorkerRouteScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Aaj ka Route 🗺️</Text>
      <Text style={styles.sub}>AI Optimized — 40% time bachayega ⚡</Text>

      {/* Map Placeholder */}
      <View style={styles.mapCard}>
        <View style={styles.mapGrid} />
        {/* Route dots */}
        {DOT_POSITIONS.map((pos, i) => (
          <View key={i} style={[styles.dot, { left: pos.x as any, top: pos.y as any }]}>
            <Text style={styles.dotNum}>{i + 1}</Text>
          </View>
        ))}
        {/* Dashed line (simplified visual) */}
        <View style={styles.routeLine} />
        <Text style={styles.mapLabel}>📍 Islamabad Route</Text>
      </View>

      {/* Stops */}
      {STOPS.map((stop) => (
        <View key={stop.n} style={[styles.stopCard, Shadow.card]}>
          <View style={styles.stopRow}>
            <View style={styles.stopNumBox}>
              <Text style={styles.stopNum}>{stop.n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stopTitle}>{stop.time} — {stop.svc}</Text>
              <Text style={styles.stopMeta}>{stop.who} · {stop.area} · {stop.dist}</Text>
            </View>
          </View>
        </View>
      ))}

      {/* Buffer notice */}
      <View style={styles.bufferCard}>
        <Text style={styles.bufferText}>⏱️ 30 min buffer included between jobs</Text>
      </View>

      {/* AI Tip */}
      <View style={[styles.tipCard, Shadow.card]}>
        <Text style={styles.tipTitle}>✨ AI Tip</Text>
        <Text style={styles.tipText}>
          Yeh route 40% time bachayega — AI ne automatically nearby jobs group kiye hain.
          G-13 → G-10 → F-7 shortest path hai.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.routeStats}>
        <View style={styles.routeStatItem}>
          <Text style={styles.routeStatVal}>3</Text>
          <Text style={styles.routeStatLabel}>Jobs</Text>
        </View>
        <View style={styles.routeStatItem}>
          <Text style={styles.routeStatVal}>7.3km</Text>
          <Text style={styles.routeStatLabel}>Total</Text>
        </View>
        <View style={styles.routeStatItem}>
          <Text style={[styles.routeStatVal, { color: Colors.primary }]}>Rs 2,900</Text>
          <Text style={styles.routeStatLabel}>Expected</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  mapCard: {
    height: 180, borderRadius: Radius.xl, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
    overflow: 'hidden', position: 'relative',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surfaceElevated,
  },
  dot: {
    position: 'absolute', width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.warning, justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.warning, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  dotNum: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '800' },
  routeLine: {
    position: 'absolute', left: '20%', top: '35%', width: '60%', height: 2,
    backgroundColor: Colors.warning + '66', transform: [{ rotate: '20deg' }],
  },
  mapLabel: { position: 'absolute', bottom: 10, right: 12, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  stopCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stopNumBox: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center',
  },
  stopNum: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.warning },
  stopTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  stopMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  bufferCard: { backgroundColor: Colors.inputBg, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  bufferText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  tipCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryDim, padding: Spacing.md, marginBottom: Spacing.md },
  tipTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  tipText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  routeStats: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  routeStatItem: { flex: 1, alignItems: 'center' },
  routeStatVal: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  routeStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
});
