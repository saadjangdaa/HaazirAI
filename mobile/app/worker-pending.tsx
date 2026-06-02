import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

export default function WorkerPendingScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshProfile, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  const status = user?.workerApprovalStatus ?? 'pending';
  const rejected = status === 'rejected';

  const handleRefresh = useCallback(async () => {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
    }
  }, [refreshProfile]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      <View style={[styles.card, Shadow.card]}>
        <View style={[styles.iconWrap, rejected && styles.iconWrapRejected]}>
          <Ionicons
            name={rejected ? 'close-circle' : 'hourglass-outline'}
            size={48}
            color={rejected ? Colors.danger : Colors.workerAccent}
          />
        </View>

        <Text style={styles.title}>
          {rejected ? 'Application reject ho gayi' : 'Request bhej di gayi hai'}
        </Text>

        <Text style={styles.body}>
          {rejected
            ? 'Admin ne aapki worker application reject kar di hai. Support se rabta karein ya dobara register karein.'
            : 'Aapki details admin panel par review ke liye bhej di gayi hain. Jab admin approve karega tab aap jobs dekh aur bid laga sakte hain.'}
        </Text>

        {!rejected && (
          <View style={styles.steps}>
            <Text style={styles.step}>1. Admin portal par request dikhe gi</Text>
            <Text style={styles.step}>2. Admin approve karega</Text>
            <Text style={styles.step}>3. Neeche &quot;Status check karein&quot; dabayein</Text>
            <Text style={styles.step}>4. Phir app khul jayegi</Text>
          </View>
        )}

        {!rejected && (
          <TouchableOpacity
            style={[styles.primaryBtn, checking && styles.btnDisabled]}
            onPress={handleRefresh}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Status check karein</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => signOut()}>
          <Text style={styles.secondaryBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.workerAccentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  iconWrapRejected: { backgroundColor: 'rgba(239,68,68,0.12)' },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  steps: { alignSelf: 'stretch', marginBottom: Spacing.lg, gap: 6 },
  step: { fontSize: FontSize.sm, color: Colors.textSecondary },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.workerAccent,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'stretch',
    marginBottom: Spacing.sm,
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.md },
  secondaryBtn: { paddingVertical: Spacing.sm },
  secondaryBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
