import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { Provider } from '../services/api';

interface Props {
  bookingId: string;
  provider: Provider;
  confirmationMessage: string;
  receipt: Record<string, unknown>;
  reminders?: string[];
}

export default function BookingReceipt({ bookingId, provider, confirmationMessage, receipt, reminders }: Props) {
  const r = receipt as any;

  return (
    <View style={styles.container}>
      {/* Success banner */}
      <View style={[styles.successBanner, Shadow.sm]}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
        </View>
        <Text style={styles.successTitle}>Booking Confirmed!</Text>
        <Text style={styles.successSub}>{confirmationMessage}</Text>
      </View>

      {/* Receipt card */}
      <View style={[styles.receiptCard, Shadow.sm]}>
        <View style={styles.receiptHeader}>
          <View style={styles.receiptHeaderLeft}>
            <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
            <Text style={styles.receiptTitle}>Booking Receipt</Text>
          </View>
          <View style={styles.confirmedBadge}>
            <Ionicons name="checkmark" size={10} color={Colors.textInverse} />
            <Text style={styles.confirmedText}>CONFIRMED</Text>
          </View>
        </View>

        <Text style={styles.bookingId}>{bookingId}</Text>

        <View style={styles.divider} />

        <ReceiptRow icon="person-outline" label="Provider" value={provider.name} />
        <ReceiptRow icon="construct-outline" label="Service" value={r?.service || provider.service} />
        <ReceiptRow icon="location-outline" label="Location" value={r?.location || `${provider.area}, ${provider.city}`} />
        <ReceiptRow icon="time-outline" label="Time" value={r?.scheduled_time || '--'} />
        {provider.phone && <ReceiptRow icon="call-outline" label="Phone" value={provider.phone} />}

        <View style={styles.divider} />

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Estimated Total</Text>
          <Text style={styles.priceValue}>{r?.estimated_price || '--'}</Text>
        </View>

        <View style={styles.paymentRow}>
          <Ionicons name="card-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.paymentText}>{(r?.payment_methods || ['Cash']).join(' · ')}</Text>
        </View>

        {r?.emergency && (
          <View style={styles.emergencyBadge}>
            <Ionicons name="warning" size={12} color={Colors.danger} />
            <Text style={styles.emergencyText}>EMERGENCY — Fast Track Active</Text>
          </View>
        )}
      </View>

      {/* Reminders */}
      {reminders && reminders.length > 0 && (
        <View style={[styles.remindersCard, Shadow.sm]}>
          <View style={styles.remindersHeader}>
            <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
            <Text style={styles.remindersTitle}>Reminders Set</Text>
          </View>
          {reminders.map((r, i) => (
            <View key={i} style={styles.reminderRow}>
              <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.reminderText}>{new Date(r).toLocaleString('en-PK')}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ReceiptRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.receiptRow}>
      <View style={styles.receiptRowLeft}>
        <Ionicons name={icon} size={14} color={Colors.textMuted} />
        <Text style={styles.receiptLabel}>{label}</Text>
      </View>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },

  // Success banner
  successBanner: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.xl, alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.successDim,
  },
  successIcon: { marginBottom: Spacing.md },
  successTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.textPrimary, marginBottom: 8 },
  successSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // Receipt card
  receiptCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  receiptHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  confirmedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.success, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  confirmedText: { color: Colors.textInverse, fontSize: 10, fontWeight: FontWeight.bold },
  bookingId: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },

  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  receiptRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptLabel: { color: Colors.textMuted, fontSize: FontSize.sm },
  receiptValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, textAlign: 'right', flex: 1, marginLeft: Spacing.md },

  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  priceLabel: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  priceValue: { color: Colors.primary, fontSize: FontSize.xxl, fontWeight: FontWeight.black },

  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  paymentText: { color: Colors.textMuted, fontSize: FontSize.xs },

  emergencyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dangerDim, borderRadius: Radius.md,
    padding: Spacing.sm, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: Colors.danger,
  },
  emergencyText: { color: Colors.danger, fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  // Reminders
  remindersCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  remindersHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  remindersTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  reminderText: { color: Colors.textMuted, fontSize: FontSize.xs },
});
