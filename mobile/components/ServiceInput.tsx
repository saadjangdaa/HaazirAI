import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Easing, Alert } from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  location: string;
  onLocationChange: (text: string) => void;
  onSubmit: () => void;
  loading?: boolean;
}

export default function ServiceInput({ value, onChangeText, location, onLocationChange, onSubmit, loading }: Props) {
  const [recording, setRecording] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = () => {
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 500, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    pulseRef.current.start();
  };

  const stopPulse = () => {
    pulseRef.current?.stop();
    Animated.timing(pulseAnim, { toValue: 1.0, duration: 150, useNativeDriver: true }).start();
  };

  const handleVoice = () => {
    if (recording) {
      setRecording(false);
      stopPulse();
      onChangeText('AC gas khatam ho gayi hai, kal subah repair chahiye — budget kam hai');
      onLocationChange('G-13, Islamabad');
    } else {
      setRecording(true);
      startPulse();
      Alert.alert('🎙 Voice Input', 'Bolein... (demo: simulated input loaded on stop)');
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.voiceWrapper, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity
          style={[styles.voiceBtn, recording && styles.voiceBtnActive, Shadow.primary]}
          onPress={handleVoice}
          activeOpacity={0.85}
        >
          <Text style={styles.voiceIcon}>{recording ? '⏹' : '🎙'}</Text>
          <Text style={styles.voiceLabel}>{recording ? 'Rokein' : 'Bolein'}</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.inputCard}>
        <TextInput
          style={styles.mainInput}
          value={value}
          onChangeText={onChangeText}
          placeholder="Kya chahiye? (Urdu ya English mein likhein)"
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          editable={!loading}
        />
        <View style={styles.divider} />
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <TextInput
            style={styles.locationInput}
            value={location}
            onChangeText={onLocationChange}
            placeholder="Aapka area (e.g. G-13, DHA, Clifton)"
            placeholderTextColor={Colors.textMuted}
            editable={!loading}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, Shadow.primary, loading && styles.submitBtnLoading]}
        onPress={onSubmit}
        disabled={loading}
      >
        <Text style={styles.submitText}>{loading ? '⏳ Agents kaam par hain...' : 'Haazir Karo! 🚀'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.lg },
  voiceWrapper: { alignSelf: 'center', marginBottom: Spacing.md },
  voiceBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primaryDim, borderWidth: 2.5, borderColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  voiceBtnActive: { backgroundColor: Colors.dangerDim, borderColor: Colors.danger },
  voiceIcon: { fontSize: 28 },
  voiceLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  inputCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  mainInput: { color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 70 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: { fontSize: 16, marginRight: 6 },
  locationInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md + 2, alignItems: 'center' },
  submitBtnLoading: { opacity: 0.7 },
  submitText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '800' },
});
