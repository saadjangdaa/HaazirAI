import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { Bid, BiddingResponse } from '../services/api';

interface Props {
  loading: boolean;
  result: BiddingResponse | null;
  onSelectBid: (bid: Bid) => void;
}

export default function BiddingPanel({ loading, result, onSelectBid }: Props) {
  if (loading) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingTitle}>MOLTOL Negotiate Kar Raha Hai...</Text>
        <Text style={styles.loadingSubText}>5 providers ko simultaneously broadcast kiya gaya</Text>
        <Text style={styles.loadingSubText}>Best deal dhoondhi ja rahi hai...</Text>
      </View>
    );
  }

  if (!result) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🤝 MOLTOL: Provider Bids</Text>

      {/* Negotiation Log */}
      <View style={styles.logCard}>
        <Text style={styles.logTitle}>Negotiation Log:</Text>
        {result.negotiation_log.slice(-4).map((entry, i) => (
          <Text key={i} style={[styles.logEntry, entry.startsWith('  ✅') && styles.logSuccess, entry.startsWith('  ❌') && styles.logFail]}>
            {entry}
          </Text>
        ))}
      </View>

      {/* Bids */}
      {result.bids.map((bid, i) => {
        const isRecommended = bid.provider_id === result.recommended_bid.provider_id;
        return (
          <View key={bid.provider_id} style={[styles.bidCard, isRecommended && styles.bidCardRecommended]}>
            {isRecommended && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>⭐ RECOMMENDED</Text>
              </View>
            )}
            <View style={styles.bidHeader}>
              <Text style={styles.bidName}>{bid.provider_name}</Text>
              <View style={styles.bidPriceBlock}>
                {bid.negotiated && (
                  <Text style={styles.originalPrice}>Rs {bid.bid_price.toLocaleString()}</Text>
                )}
                <Text style={[styles.finalPrice, isRecommended && styles.finalPriceHighlight]}>
                  Rs {bid.final_price.toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.bidMeta}>
              <Text style={styles.bidMetaText}>⭐ {bid.rating}</Text>
              <Text style={styles.bidMetaDot}>·</Text>
              <Text style={styles.bidMetaText}>🛵 {bid.eta_minutes} min ETA</Text>
              {bid.negotiated && (
                <>
                  <Text style={styles.bidMetaDot}>·</Text>
                  <Text style={styles.negotiatedTag}>💬 Negotiated</Text>
                </>
              )}
            </View>

            <Text style={styles.bidMessage}>"{bid.message}"</Text>

            <TouchableOpacity
              style={[styles.selectBidBtn, isRecommended && styles.selectBidBtnHighlight, Shadow.card]}
              onPress={() => onSelectBid(bid)}
            >
              <Text style={[styles.selectBidText, isRecommended && styles.selectBidTextHighlight]}>
                {isRecommended ? '✅ Ye Waala Chunein' : 'Is Se Book Karein'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  title: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.sm },
  loadingCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary, marginBottom: Spacing.md },
  loadingTitle: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700', marginTop: Spacing.md },
  loadingSubText: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 4, textAlign: 'center' },
  logCard: { backgroundColor: '#0A1A0A', borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.primaryDim },
  logTitle: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', marginBottom: 4 },
  logEntry: { color: Colors.textMuted, fontSize: FontSize.xs, fontFamily: 'monospace', marginBottom: 2 },
  logSuccess: { color: Colors.primary },
  logFail: { color: Colors.danger },
  bidCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm, position: 'relative' },
  bidCardRecommended: { borderColor: Colors.primary, backgroundColor: '#001A0E' },
  recommendedBadge: { position: 'absolute', top: -10, right: Spacing.md, backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 2 },
  recommendedText: { color: Colors.background, fontSize: FontSize.xs, fontWeight: '800' },
  bidHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: 6 },
  bidName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  bidPriceBlock: { alignItems: 'flex-end' },
  originalPrice: { color: Colors.textMuted, fontSize: FontSize.xs, textDecorationLine: 'line-through' },
  finalPrice: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800' },
  finalPriceHighlight: { color: Colors.primary },
  bidMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  bidMetaText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  bidMetaDot: { color: Colors.textMuted, marginHorizontal: 4 },
  negotiatedTag: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '700' },
  bidMessage: { color: Colors.textMuted, fontSize: FontSize.sm, fontStyle: 'italic', marginBottom: Spacing.sm },
  selectBidBtn: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  selectBidBtnHighlight: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  selectBidText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  selectBidTextHighlight: { color: Colors.background, fontWeight: '800' },
});
