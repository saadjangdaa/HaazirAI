import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { submitDispute, DisputeResolution } from '../services/api';

interface Props {
  bookingId: string;
  onResolved?: (resolution: DisputeResolution) => void;
}

const TYPES = [
  { id: 'no_show', label: 'Nahi Aaya', icon: '🚫' },
  { id: 'quality_complaint', label: 'Kaam Kharab', icon: '👎' },
  { id: 'price_disagreement', label: 'Zyada Charge', icon: '💰' },
  { id: 'refund_request', label: 'Refund', icon: '💸' },
];

export default function DisputeFlow({ bookingId, onResolved }: Props) {
  const [step, setStep] = useState<'type' | 'describe' | 'resolved'>('type');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState<DisputeResolution | null>(null);

  const handleSubmit = async () => {
    if (!description.trim()) { Alert.alert('Description lazmi hai'); return; }
    setLoading(true);
    try {
      const res = await submitDispute({ bookingId, disputeType: type, description });
      setResolution(res);
      setStep('resolved');
      onResolved?.(res);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Kuch masla hua');
    }
    setLoading(false);
  };

  if (step === 'type') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Masla chunein:</Text>
        <View style={styles.grid}>
          {TYPES.map((t) => (
            <TouchableOpacity key={t.id} style={[styles.typeBtn, type === t.id && styles.typeBtnActive]} onPress={() => { setType(t.id); setStep('describe'); }}>
              <Text style={styles.typeIcon}>{t.icon}</Text>
              <Text style={[styles.typeLabel, type === t.id && styles.typeLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  if (step === 'describe') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Kya hua? Batao:</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Poori baat likhein..."
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        {loading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          <TouchableOpacity style={[styles.submitBtn, Shadow.primary]} onPress={handleSubmit}>
            <Text style={styles.submitText}>⚖️ Submit Karo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (step === 'resolved' && resolution) {
    return (
      <View style={styles.resolutionContainer}>
        <Text style={styles.resolutionIcon}>{resolution.refund_amount > 0 ? '💚' : 'ℹ️'}</Text>
        <Text style={styles.resolutionTitle}>JHAGRA ka Faisla</Text>
        <Text style={styles.resolutionText}>{resolution.resolution}</Text>
        {resolution.refund_amount > 0 && (
          <View style={styles.refundBadge}>
            <Text style={styles.refundText}>Refund: Rs {resolution.refund_amount.toLocaleString()}</Text>
          </View>
        )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  title: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeBtn: { width: '47%', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  typeBtnActive: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  typeIcon: { fontSize: 24, marginBottom: 4 },
  typeLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  typeLabelActive: { color: Colors.danger },
  input: { backgroundColor: Colors.inputBg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 100, marginBottom: Spacing.md },
  submitBtn: { backgroundColor: Colors.danger, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  submitText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '800' },
  resolutionContainer: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary },
  resolutionIcon: { fontSize: 40, marginBottom: Spacing.sm },
  resolutionTitle: { color: Colors.primary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.sm },
  resolutionText: { color: Colors.textPrimary, fontSize: FontSize.md, textAlign: 'center', marginBottom: Spacing.md },
  refundBadge: { backgroundColor: Colors.primaryDim, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  refundText: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '800' },
});
