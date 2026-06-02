import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { submitFeedback } from '../services/api';

const FEEDBACK_CHIPS = [
  { id: 'on_time',      label: 'On Time',         icon: 'time-outline',          positive: true  },
  { id: 'good_work',    label: 'Good Work',        icon: 'thumbs-up-outline',     positive: true  },
  { id: 'professional', label: 'Professional',     icon: 'briefcase-outline',     positive: true  },
  { id: 'polite',       label: 'Polite',           icon: 'happy-outline',         positive: true  },
  { id: 'overcharged',  label: 'Overcharged',      icon: 'cash-outline',          positive: false },
  { id: 'late',         label: 'Late Aaye',        icon: 'alarm-outline',         positive: false },
  { id: 'poor_quality', label: 'Kaam Acha Nahi',   icon: 'thumbs-down-outline',   positive: false },
];

const RATING_LABELS = ['', 'Bilkul Theek Nahi', 'Theek Nahi', 'Theek Tha', 'Acha Tha', 'Zabardast!'];

export default function FeedbackScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { bookingId, providerId: providerIdParam } = useLocalSearchParams<{
    bookingId: string;
    providerId?: string;
  }>();
  const insets = useSafeAreaInsets();

  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const toggleTag = (id: string) =>
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  const handleSubmit = async () => {
    setError('');
    if (rating === 0) {
      setError('Rating dein — 1 se 5 stars mein');
      return;
    }

    const bid = (bookingId || 'DEMO').trim();
    const uid = user?.id || 'anonymous';
    const pid = providerIdParam || 'p001';

    setLoading(true);
    let saved = false;

    // Primary: save directly to Firestore (works even when backend is in mock mode)
    try {
      await setDoc(doc(db, 'reviews', bid), {
        booking_id: bid,
        user_id: uid,
        provider_id: pid,
        rating,
        tags: selectedTags,
        review: review.trim() || null,
        created_at: new Date().toISOString(),
      });
      saved = true;
    } catch (e) {
      console.warn('[Feedback] Firestore write failed:', e);
    }

    // Secondary: also try backend API (ignore if it fails)
    try {
      await submitFeedback({ bookingId: bid, userId: uid, providerId: pid, rating, tags: selectedTags, review: review.trim() || undefined });
      saved = true;
    } catch (e) {
      console.warn('[Feedback] Backend submit failed (using Firestore):', e);
    }

    setLoading(false);

    if (saved) {
      setSubmitted(true);
    } else {
      setError('Feedback submit nahi hua — internet check karein aur dobara try karein');
    }
  };

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
        </View>
        <Text style={styles.successTitle}>Shukriya!</Text>
        <Text style={styles.successSub}>
          Aapka feedback submit ho gaya.{'\n'}Aapki rating se doosron ko faida hoga.
        </Text>
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/' as any)}>
          <Text style={styles.homeBtnText}>Wapas Ghar Jao</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        <Text style={styles.backText}>Feedback Dein</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Service Kaisi Rahi?</Text>
      <Text style={styles.sub}>Booking: {bookingId || 'DEMO'}</Text>

      {/* Star Rating */}
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((s) => (
          <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7}>
            <Ionicons
              name={s <= rating ? 'star' : 'star-outline'}
              size={44}
              color={s <= rating ? Colors.warning : Colors.border}
            />
          </TouchableOpacity>
        ))}
      </View>
      {rating > 0 && (
        <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>
      )}

      {/* Chips */}
      <Text style={styles.sectionLabel}>Jaldi Batao:</Text>
      <View style={styles.chipsGrid}>
        {FEEDBACK_CHIPS.map((chip) => {
          const active = selectedTags.includes(chip.id);
          return (
            <TouchableOpacity
              key={chip.id}
              style={[
                styles.chip,
                active && (chip.positive ? styles.chipPosActive : styles.chipNegActive),
              ]}
              onPress={() => toggleTag(chip.id)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={chip.icon as any}
                size={14}
                color={active ? (chip.positive ? Colors.primary : Colors.danger) : Colors.textMuted}
              />
              <Text style={[styles.chipText, active && { color: chip.positive ? Colors.primary : Colors.danger, fontWeight: FontWeight.bold }]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Review Text */}
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

      {/* Photo Placeholder */}
      <TouchableOpacity style={styles.photoBtn} activeOpacity={0.7}>
        <Ionicons name="camera-outline" size={16} color={Colors.textMuted} />
        <Text style={styles.photoBtnText}>Photo / Evidence Lagayein</Text>
      </TouchableOpacity>

      {/* Inline error */}
      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={15} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Submit ho raha hai...</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.submitBtn, Shadow.primary, rating === 0 && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          <Text style={styles.submitBtnText}>Feedback Submit Karo</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: Spacing.sm, marginBottom: Spacing.sm,
  },
  backText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },

  title: {
    fontSize: FontSize.xxl, fontWeight: FontWeight.black,
    color: Colors.textPrimary, textAlign: 'center', marginBottom: 4,
  },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.lg },

  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  ratingLabel: {
    color: Colors.warning, fontSize: FontSize.md, fontWeight: FontWeight.bold,
    textAlign: 'center', marginBottom: Spacing.lg,
  },

  sectionLabel: {
    fontSize: FontSize.sm, fontWeight: FontWeight.semibold,
    color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm,
  },

  chipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  chipPosActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
  chipNegActive: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },

  reviewInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    padding: Spacing.md, color: Colors.textPrimary,
    fontSize: FontSize.md, minHeight: 100, marginBottom: Spacing.md,
  },

  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  photoBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.dangerDim, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.danger,
  },
  errorText: { flex: 1, fontSize: FontSize.sm, color: Colors.danger },

  loadingWrap: { alignItems: 'center', gap: 8, paddingVertical: Spacing.lg },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    padding: Spacing.md + 2, marginTop: Spacing.sm,
  },
  submitBtnDisabled: { backgroundColor: Colors.border },
  submitBtnText: { fontSize: FontSize.lg, fontWeight: FontWeight.black, color: '#fff' },

  successContainer: {
    flex: 1, backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
  },
  successIconWrap: { marginBottom: Spacing.md },
  successTitle: {
    fontSize: FontSize.xxxl, fontWeight: FontWeight.black,
    color: Colors.primary, marginBottom: Spacing.sm,
  },
  successSub: {
    fontSize: FontSize.md, color: Colors.textSecondary,
    textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 22,
  },
  homeBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  homeBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
