import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';
import { Provider } from '../services/api';

interface Props {
  bookingId: string;
  provider: Provider;
  confirmationMessage: string;
  receipt: Record<string, unknown>;
  reminders?: string[];
}

export default function BookingReceipt({ bookingId, provider, confirmationMessage, receipt, reminders }: Props) {
  const receiptData = receipt as any;
  return (
    <View style={styles.container}>
      {/* WhatsApp-style message bubble */}
      <View style={styles.messageBubble}>
        <Text style={styles.messageText}>{confirmationMessage}</Text>
        <Text style={styles.messageTime}>✓✓ Haazir AI</Text>
      </View>

      {/* Receipt Card */}
      <View style={styles.receiptCard}>
        <View style={styles.receiptHeader}>
          <Text style={styles.receiptTitle}>🧾 Booking Receipt</Text>
          <Text style={styles.receiptId}>{bookingId}</Text>
        </View>

        <View style={styles.divider} />

        <ReceiptRow label="Provider" value={provider.name} />
        <ReceiptRow label="Service" value={receiptData?.service || provider.service} />
        <ReceiptRow label="Location" value={receiptData?.location || `${provider.area}, ${provider.city}`} />
        <ReceiptRow label="Time" value={receiptData?.scheduled_time || '--'} />
        <ReceiptRow label="Phone" value={provider.phone} />

        <View style={styles.divider} />

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Estimated Total</Text>
          <Text style={styles.priceValue}>{receiptData?.estimated_price || '--'}</Text>
        </View>

        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Payment Methods:</Text>
          <Text style={styles.paymentValue}>{(receiptData?.payment_methods || ['Cash']).join(' · ')}</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>✅ CONFIRMED</Text>
          </View>
          {receiptData?.emergency && (
            <View style={styles.emergencyBadge}>
              <Text style={styles.emergencyText}>🚨 EMERGENCY</Text>
            </View>
          )}
        </View>
      </View>

      {/* Reminders */}
      {reminders && reminders.length > 0 && (
        <View style={styles.remindersCard}>
          <Text style={styles.remindersTitle}>🔔 Reminders Set:</Text>
          {reminders.map((r, i) => (
            <Text key={i} style={styles.reminderText}>• {new Date(r).toLocaleString('en-PK')}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  messageBubble: { backgroundColor: '#005C4B', borderRadius: Radius.lg, borderTopRightRadius: 4, padding: Spacing.md, marginBottom: Spacing.md, alignSelf: 'flex-end', maxWidth: '90%' },
  messageText: { color: '#FFFFFF', fontSize: FontSize.md, lineHeight: 22 },
  messageTime: { color: '#8AACAF', fontSize: FontSize.xs, marginTop: 4, textAlign: 'right' },
  receiptCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  receiptTitle: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '700' },
  receiptId: { color: Colors.textMuted, fontSize: FontSize.xs },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  receiptLabel: { color: Colors.textMuted, fontSize: FontSize.sm, flex: 1 },
  receiptValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600', flex: 2, textAlign: 'right' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  priceLabel: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
  priceValue: { color: Colors.primary, fontSize: FontSize.xxl, fontWeight: '800' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  paymentLabel: { color: Colors.textMuted, fontSize: FontSize.xs },
  paymentValue: { color: Colors.textSecondary, fontSize: FontSize.xs },
  statusRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  statusBadge: { backgroundColor: Colors.primaryDim, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  statusText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  emergencyBadge: { backgroundColor: Colors.dangerDim, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  emergencyText: { color: Colors.danger, fontSize: FontSize.xs, fontWeight: '800' },
  remindersCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  remindersTitle: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: Spacing.xs },
  reminderText: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: 2 },
});
