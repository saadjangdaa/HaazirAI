import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize } from '../constants/theme';

export default function AuthSplash() {
  return (
    <View style={styles.root}>
      <Text style={styles.emoji}>🤝</Text>
      <Text style={styles.title}>Haazir AI</Text>
      <Text style={styles.tagline}>Pakistan ka Pehla Agentic Home Services</Text>
      <ActivityIndicator
        size="large"
        color={Colors.primary}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emoji: {
    fontSize: 56,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  spinner: {
    marginTop: Spacing.md,
  },
});
