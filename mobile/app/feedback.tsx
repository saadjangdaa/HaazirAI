import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { submitFeedback } from '../services/api';

const FEEDBACK_CHIPS = [
  { id: 'on_time', label: 'On Time', icon: '⏰', positive: true },
  { id: 'good_work', label: 'Good Work', icon: '👍', positive: true },
  { id: 'professional', label: 'Professional', icon: '💼', positive: true },
  { id: 'polite', label: 'Polite', icon: '😊', positive: true },
  { id: 'overcharged', label: 'Overcharged', icon: '💰', positive: false },
  { id: 'late', label: 'Late Aaye', icon: '⏱', positive: false },
  { id: 'poor_quality', label: 'Kaam Acha Nahi', icon: '👎', positive: false },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (rating === 0) { Alert.alert('Rating dein!', '1 se 5 stars mein rating lazmi hai'); return; }
    setLoading(true);
    try {
      await submitFeedback({
        bookingId: bookingId || 'HAZ-DEMO-001',
        userId: 'user_001',
        providerId: 'p001',
        rating,
        tags: selectedTags,
        review: review.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Feedback submit nahi hua');
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successIcon}>🎉</Text>
        <Text style={styles.successTitle}>Shukriya!</Text>
        <Text style={styles.successSub}>Aapka feedback submit ho gaya. Aapki rating se doosron ko faida hoga.</Text>
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.push('/')}>
          <Text style={styles.homeBtnText}>Wapas Ghar Jao</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Service Kaisi Rahi?</Text>
      <Text style={styles.sub}>Booking: {bookingId || 'HAZ-DEMO-001'}</Text>

      {/* Star Rating */}
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((s) => (
          <TouchableOpacity key={s} onPress={() => setRating(s)}>
            <Text style={[styles.star, s <= rating && styles.starActive]}>
              {s <= rating ? '⭐' : '☆'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {rating > 0 && (
        <Text style={styles.ratingLabel}>
          {['', 'Bilkul Theek Nahi', 'Theek Nahi', 'Theek Tha', 'Acha Tha', 'Zabardast!'][rating]}
        </Text>
      )}

      {/* Feedback Chips */}
      <Text style={styles.sectionLabel}>Jaldi Batao:</Text>
      <View style={styles.chipsGrid}>
        {FEEDBACK_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={[
              styles.chip,
              selectedTags.includes(chip.id) && (chip.positive ? styles.chipPositiveActive : styles.chipNegativeActive),
            ]}
            onPress={() => toggleTag(chip.id)}
          >
            <Text style={styles.chipIcon}>{chip.icon}</Text>
            <Text style={[styles.chipText, selectedTags.includes(chip.id) && { color: chip.positive ? Colors.primary : Colors.danger }]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Text Review */}
      <Text style={styles.sectionLabel}>Tafseel Se Likhein (Optional):</Text>
      <TextInput
        style={styles.reviewInput}
        value={review}
        onChangeText={setReview}
        placeholder="Provider ke baray mein kuch aur batana chahte hain?"
        placeholderTextColor={Colors.textMuted}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      {/* Photo Evidence Placeholder */}
      <TouchableOpacity style={styles.photoBtn} onPress={() => Alert.alert('Photo', 'Camera feature — coming soon')}>
        <Text style={styles.photoBtnText}>📷 Photo / Evidence Lagayein</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.lg }} />
      ) : (
        <TouchableOpacity style={[styles.submitBtn, Shadow.primary]} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>✅ Feedback Submit Karo</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  sub: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginBottom: Spacing.xl },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  star: { fontSize: 40, color: Colors.textMuted },
  starActive: { color: Colors.warning },
  ratingLabel: { color: Colors.warning, fontSize: FontSize.md, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.lg },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm, marginTop: Spacing.sm },
  chipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.cardBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  chipPositiveActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
  chipNegativeActive: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  chipIcon: { fontSize: 14 },
  chipText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  reviewInput: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 100, marginBottom: Spacing.md },
  photoBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  photoBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md + 2, alignItems: 'center', marginTop: Spacing.sm },
  submitBtnText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
  successContainer: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  successIcon: { fontSize: 64, marginBottom: Spacing.md },
  successTitle: { color: Colors.primary, fontSize: FontSize.xxxl, fontWeight: '900', marginBottom: Spacing.sm },
  successSub: { color: Colors.textSecondary, fontSize: FontSize.md, textAlign: 'center', marginBottom: Spacing.xl },
  homeBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  homeBtnText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '700' },
});
