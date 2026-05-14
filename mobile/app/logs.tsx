import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';
import AgentLogViewer from '../components/AgentLogViewer';
import { AgentLog } from '../services/api';

const DEMO_LOGS: AgentLog[] = [
  {
    agent_name: 'SAMAJH',
    agent_name_urdu: 'سمجھ',
    start_time: new Date(Date.now() - 5000).toISOString(),
    end_time: new Date(Date.now() - 4200).toISOString(),
    input_summary: "User input: 'AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye'",
    output_summary: 'Service: AC repair | City: Islamabad | Urgency: high',
    decision_made: 'Intent extracted successfully',
    confidence: 0.92,
    fallback_used: false,
    time_seconds: 0.812,
  },
  {
    agent_name: 'DHUNDHO',
    agent_name_urdu: 'ڈھونڈو',
    start_time: new Date(Date.now() - 4100).toISOString(),
    end_time: new Date(Date.now() - 3500).toISOString(),
    input_summary: 'Looking for AC repair in Islamabad (G-13), complexity=intermediate',
    output_summary: 'Found 8 matching providers, returning top 8',
    decision_made: 'Filters: service=AC repair, city=Islamabad, available=true',
    confidence: 1.0,
    fallback_used: false,
    time_seconds: 0.612,
  },
  {
    agent_name: 'CHUNNO',
    agent_name_urdu: 'چُنّو',
    start_time: new Date(Date.now() - 3400).toISOString(),
    end_time: new Date(Date.now() - 2800).toISOString(),
    input_summary: 'Ranking 8 providers for AC repair',
    output_summary: 'Top provider: Muhammad Ali AC Services (score=0.847)',
    decision_made: '8-factor weighted scoring applied. 1 warning generated.',
    confidence: 0.95,
    fallback_used: false,
    time_seconds: 0.621,
  },
  {
    agent_name: 'HIFAZAT',
    agent_name_urdu: 'حفاظت',
    start_time: new Date(Date.now() - 2700).toISOString(),
    end_time: new Date(Date.now() - 2200).toISOString(),
    input_summary: 'Trust-checking 8 providers for customer user_001',
    output_summary: '0 blocked, 2 warned, 6 approved',
    decision_made: 'Trust scores computed. 0 global flags.',
    confidence: 0.90,
    fallback_used: false,
    time_seconds: 0.497,
  },
  {
    agent_name: 'HISAAB',
    agent_name_urdu: 'حساب',
    start_time: new Date(Date.now() - 2100).toISOString(),
    end_time: new Date(Date.now() - 1600).toISOString(),
    input_summary: 'Pricing for Muhammad Ali AC Services | intermediate job | high urgency | 2.1km',
    output_summary: 'Total: Rs 1,580 | Base: Rs 1,600 | Provider earns: Rs 1,422',
    decision_made: 'Surge factor 1.2x | No loyalty discount | Budget alternative suggested',
    confidence: 0.98,
    fallback_used: false,
    time_seconds: 0.502,
  },
  {
    agent_name: 'PAKKA',
    agent_name_urdu: 'پکّا',
    start_time: new Date(Date.now() - 1500).toISOString(),
    end_time: new Date(Date.now() - 800).toISOString(),
    input_summary: 'Booking AC repair with Muhammad Ali AC Services for 2025-06-01 10:00',
    output_summary: 'Booking HAZ-20250601-A3B4C5 confirmed at 2025-06-01 10:00',
    decision_made: 'Slot confirmed, no conflict. Reminders set.',
    confidence: 0.97,
    fallback_used: false,
    time_seconds: 0.698,
  },
];

export default function LogsScreen() {
  const [logs] = useState<AgentLog[]>(DEMO_LOGS);

  const handleExport = () => {
    Alert.alert('Export Logs', 'In production: share JSON log file with judges.\n\nLog count: ' + logs.length);
  };

  const totalTime = logs.reduce((s, l) => s + l.time_seconds, 0).toFixed(2);
  const avgConfidence = (logs.reduce((s, l) => s + l.confidence, 0) / logs.length * 100).toFixed(0);
  const fallbacks = logs.filter((l) => l.fallback_used).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🤖 Agent Reasoning Trace</Text>
      <Text style={styles.sub}>Full pipeline execution log — for hackathon judges</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{logs.length}</Text>
          <Text style={styles.statLabel}>Agents</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalTime}s</Text>
          <Text style={styles.statLabel}>Total Time</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>{avgConfidence}%</Text>
          <Text style={styles.statLabel}>Avg Confidence</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: fallbacks > 0 ? Colors.warning : Colors.primary }]}>
            {fallbacks}
          </Text>
          <Text style={styles.statLabel}>Fallbacks</Text>
        </View>
      </View>

      <AgentLogViewer logs={logs} expanded />

      <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
        <Text style={styles.exportBtnText}>📤 Logs Export Karein</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D1A' },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { color: Colors.primary, fontSize: FontSize.xxl, fontWeight: '800', marginBottom: 4 },
  sub: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.lg },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statValue: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800' },
  statLabel: { color: Colors.textMuted, fontSize: FontSize.xs },
  exportBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.lg, borderWidth: 1, borderColor: Colors.primary },
  exportBtnText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
});
