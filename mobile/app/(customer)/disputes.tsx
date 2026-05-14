import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';

const DISPUTE_TYPES = [
  { id: 'noshow', label: 'Provider No-Show', icon: '😤' },
  { id: 'price', label: 'Price Disagreement', icon: '💰' },
  { id: 'quality', label: 'Quality Complaint', icon: '😞' },
  { id: 'incomplete', label: 'Job Not Completed', icon: '⏰' },
];

const RESOLUTIONS = [
  { label: '🔄 Re-do Service (Free)', tone: 'primary' },
  { label: '💸 Partial Refund: Rs 300', tone: 'warning' },
  { label: '📞 Human Agent se baat karein', tone: 'ghost' },
];

export default function DisputesScreen() {
  const [sel, setSel] = useState('quality');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Dispute Darj Ho Gaya!</Text>
          <Text style={styles.successText}>Dispute #D-0021 · 24hr mein jawab milega</Text>
          <View style={styles.successBadge}><Text style={styles.successBadgeText}>Under Review ⏳</Text></View>
          <Text style={styles.successNote}>⚠️ Provider flagged for review</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => { setSel('quality'); setDescription(''); setSubmitted(false); }}>
          <Text style={styles.newBtnText}>Naya Dispute Darj Karein</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Masla Darj Karein 🚨</Text>
      <Text style={styles.sub}>Koi masla? Haazir AI aapki madad karega.</Text>

      {/* Dispute Types */}
      <Text style={styles.sectionLabel}>Masle ki qisam:</Text>
      <View style={styles.typeGrid}>
        {DISPUTE_TYPES.map((t) => {
          const on = sel === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.typeCard, on && styles.typeCardActive]}
              onPress={() => setSel(t.id)}
            >
              <Text style={styles.typeIcon}>{t.icon}</Text>
              <Text style={[styles.typeLabel, on && styles.typeLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Description */}
      <Text style={styles.sectionLabel}>Kya hua? Batayein:</Text>
      <View style={[styles.textAreaCard, Shadow.card]}>
        <TextInput
          style={styles.textArea}
          placeholder="Masle ki poori tafseelaat likhein..."
          placeholderTextColor={Colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.evidenceBtn}>
          <Text style={styles.evidenceBtnText}>📷 Evidence Add Karein</Text>
        </TouchableOpacity>
      </View>

      {/* AI Agent Status */}
      <View style={[styles.aiCard, Shadow.card]}>
        <Text style={styles.aiTitle}>✨ Dispute Agent active hai</Text>
        <Text style={styles.aiText}>Provider ki history check ho rahi hai...</Text>
        <View style={styles.aiResult}>
          <Text style={styles.aiResultText}>📊 Last 30 din mein 2 complaints — review warranted</Text>
        </View>
      </View>

      {/* Resolution Options */}
      <Text style={styles.sectionLabel}>Resolution Options:</Text>
      {RESOLUTIONS.map((r) => (
        <TouchableOpacity
          key={r.label}
          style={[
            styles.resBtn,
            r.tone === 'primary' && styles.resBtnPrimary,
            r.tone === 'warning' && styles.resBtnWarning,
            Shadow.card,
          ]}
          onPress={() => setSubmitted(true)}
        >
          <Text style={[
            styles.resBtnText,
            r.tone === 'primary' && styles.resBtnTextWhite,
            r.tone === 'warning' && styles.resBtnTextWhite,
          ]}>{r.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.danger, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.lg },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  typeCard: {
    width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md,
  },
  typeCardActive: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  typeIcon: { fontSize: 24, marginBottom: 6 },
  typeLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  typeLabelActive: { color: Colors.danger },
  textAreaCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  textArea: { color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 80 },
  evidenceBtn: { marginTop: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  evidenceBtnText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' },
  aiCard: { backgroundColor: Colors.dangerDim, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.danger + '33', padding: Spacing.md, marginBottom: Spacing.md },
  aiTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.danger, marginBottom: 4 },
  aiText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  aiResult: { backgroundColor: Colors.surface + 'AA', borderRadius: Radius.sm, padding: Spacing.sm },
  aiResultText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  resBtn: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.sm },
  resBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  resBtnWarning: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  resBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  resBtnTextWhite: { color: Colors.background },
  successCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary, padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.lg },
  successIcon: { fontSize: 48, marginBottom: Spacing.md },
  successTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  successText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  successBadge: { backgroundColor: Colors.warningDim, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 4, marginBottom: Spacing.sm },
  successBadgeText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.warning },
  successNote: { fontSize: FontSize.xs, color: Colors.danger },
  newBtn: { borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center' },
  newBtnText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
});
