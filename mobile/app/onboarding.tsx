import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';

const SLIDES = [
  {
    icon: 'home-outline' as const,
    iconBg: Colors.primaryLight,
    iconColor: Colors.primary,
    title: 'Har Kaam Haazir',
    subtitle: 'Pakistan ka pehla AI\nhome services platform',
    hint: 'Ghar baithe koi bhi kaam karwao',
  },
  {
    icon: 'hardware-chip-outline' as const,
    iconBg: 'rgba(167,139,250,0.15)',
    iconColor: '#7C3AED',
    title: '6 AI Agents',
    subtitle: 'SAMJHO · CHUNNO · DHUNDHO\nPAKKA · MOLTOL · HIFAZAT',
    hint: 'Aapki request sun ke best provider dhoondte hain',
  },
  {
    icon: 'mic-outline' as const,
    iconBg: Colors.warningDim,
    iconColor: Colors.workerAccent,
    title: 'Bolein Ya Likhein',
    subtitle: 'Urdu, Roman Urdu\nya English — sab chalega',
    hint: 'Voice se booking, bilkul aasaan',
  },
];

function HaazirLogo() {
  return (
    <View style={styles.logoCircle}>
      <Text style={styles.logoEmoji}>🤝</Text>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const dotAnims = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  const goToSlide = (index: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 20, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setCurrentIndex(index);
      slideAnim.setValue(-20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });

    dotAnims.forEach((a, i) => {
      Animated.spring(a, { toValue: i === index ? 1 : 0, useNativeDriver: false }).start();
    });
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      goToSlide(currentIndex + 1);
    } else {
      handleGetStarted();
    }
  };

  const handleGetStarted = async () => {
    try { await AsyncStorage.setItem('haazir_onboarding_seen', '1'); } catch {}
    router.replace('/login');
  };

  const slide = SLIDES[currentIndex];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Blue hero top */}
      <View style={[styles.hero, { paddingTop: insets.top + Spacing.lg }]}>
        <TouchableOpacity style={styles.skipBtn} onPress={handleGetStarted} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        <View style={styles.logoArea}>
          <HaazirLogo />
          <Text style={styles.brandName}>Haazir</Text>
          <Text style={styles.brandTagline}>Pakistan ka Agentic Home Services</Text>
        </View>
      </View>

      {/* White card bottom */}
      <View style={[styles.card, Shadow.modal]}>
        {/* Animated slide content */}
        <Animated.View style={[styles.slideContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={[styles.iconBox, { backgroundColor: slide.iconBg }]}>
            <Ionicons name={slide.icon} size={34} color={slide.iconColor} />
          </View>
          <Text style={styles.slideTitle}>{slide.title}</Text>
          <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
          <Text style={styles.slideHint}>{slide.hint}</Text>
        </Animated.View>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const dotWidth = dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [8, 26] });
            const dotOpacity = dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]}
              />
            );
          })}
        </View>

        {/* Button */}
        <TouchableOpacity
          style={[styles.nextBtn, Shadow.primary]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {currentIndex === SLIDES.length - 1 ? 'Shuru Karein' : 'Agle'}
          </Text>
          <Ionicons
            name={currentIndex === SLIDES.length - 1 ? 'arrow-forward' : 'chevron-forward'}
            size={18}
            color={Colors.textInverse}
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        {/* Voice hint */}
        <View style={[styles.voiceHint, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Ionicons name="mic-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.voiceHintText}>Voice assistance active</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primary },

  hero: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
  },
  skipBtn: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    marginBottom: Spacing.lg,
  },
  skipText: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  logoArea: { alignItems: 'center' },
  logoCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.30)',
  },
  logoEmoji: { fontSize: 44 },
  brandName: {
    fontSize: 38, fontWeight: FontWeight.black,
    color: Colors.textInverse, letterSpacing: -0.5,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },

  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    alignItems: 'center',
    marginTop: -Spacing.xl,
  },

  slideContent: { alignItems: 'center', width: '100%', paddingBottom: Spacing.lg },
  iconBox: {
    width: 76, height: 76, borderRadius: 38,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  slideTitle: {
    fontSize: FontSize.xxl, fontWeight: FontWeight.black,
    color: Colors.textPrimary, textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  slideSubtitle: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold,
    color: Colors.textSecondary, textAlign: 'center',
    lineHeight: 24, marginBottom: Spacing.sm,
  },
  slideHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center', lineHeight: 20,
  },

  dots: { flexDirection: 'row', gap: Spacing.xs, alignItems: 'center', marginBottom: Spacing.lg },
  dot: { height: 8, borderRadius: 4, backgroundColor: Colors.primary },

  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary,
    width: '100%', height: 56, borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  nextBtnText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse },

  voiceHint: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  voiceHintText: { fontSize: FontSize.xs, color: Colors.textMuted },
});
