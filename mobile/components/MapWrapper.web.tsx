import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow } from '../constants/theme';
import { MOCK_NEARBY_WORKERS, NearbyWorker } from '../data/mockData';

// Web-safe Location mock
export const Location = {
  requestForegroundPermissionsAsync: async () => ({ status: 'denied' as const }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 24.8907, longitude: 67.0968 } }),
  Accuracy: { Balanced: 3 },
};

export const DEFAULT_REGION = {
  latitude: 24.8907,
  longitude: 67.0968,
  latitudeDelta: 0.048,
  longitudeDelta: 0.048,
};

const SERVICE_COLORS: Record<string, string> = {
  'AC Repair':   '#1A6FFF',
  'Plumber':     '#0099CC',
  'Electrician': '#FF9500',
  'Tutor':       '#34C759',
  'Beautician':  '#FF2D55',
  'Carpenter':   '#8B572A',
};

const SERVICE_ICONS: Record<string, string> = {
  'AC Repair':   'snow-outline',
  'Plumber':     'water-outline',
  'Electrician': 'flash-outline',
  'Tutor':       'book-outline',
  'Beautician':  'sparkles-outline',
  'Carpenter':   'hammer-outline',
};

type Props = {
  mapRef?: React.RefObject<any>;
  userLocation: { latitude: number; longitude: number } | null;
  selectedProvider: NearbyWorker | null;
  onMarkerPress: (worker: NearbyWorker) => void;
};

export function MapSection({ selectedProvider, onMarkerPress }: Props) {
  return (
    <View style={styles.mapContainer}>
      {/* Stylized grid background */}
      <View style={StyleSheet.absoluteFillObject}>
        {Array.from({ length: 14 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLineH, { top: `${i * 7.5}%` as any }]} />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: `${i * 11}%` as any }]} />
        ))}
      </View>

      {/* City label */}
      <View style={styles.cityLabel}>
        <Ionicons name="location" size={12} color={Colors.primary} />
        <Text style={styles.cityLabelText}>Karachi, Pakistan</Text>
      </View>

      {/* Karachi decorative roads */}
      <View style={styles.roadH1} />
      <View style={styles.roadH2} />
      <View style={styles.roadV1} />
      <View style={styles.roadV2} />
      <View style={styles.roadDiag} />

      {/* Worker markers */}
      {MOCK_NEARBY_WORKERS.map((worker) => (
        <TouchableOpacity
          key={worker.id}
          style={[
            styles.markerBubble,
            {
              top: `${clamp(20 + (worker.lat - 24.85) * 2200, 10, 75)}%` as any,
              left: `${clamp(15 + (worker.lng - 67.05) * 2200, 5, 85)}%` as any,
              backgroundColor: worker.available
                ? (SERVICE_COLORS[worker.service] || Colors.primary)
                : '#BBBBBB',
            },
            selectedProvider?.id === worker.id && styles.markerSelected,
          ]}
          onPress={() => onMarkerPress(worker)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={(SERVICE_ICONS[worker.service] || 'person-outline') as any}
            size={selectedProvider?.id === worker.id ? 15 : 13}
            color="#fff"
          />
        </TouchableOpacity>
      ))}

      {/* Sea (bottom) */}
      <View style={styles.sea} />

      {/* Map watermark */}
      <View style={styles.watermark}>
        <Text style={styles.watermarkText}>🗺 Karachi (Mock Map)</Text>
      </View>
    </View>
  );
}

const clamp = (val: number, min: number, max: number) =>
  Math.min(Math.max(val, min), max);

const styles = StyleSheet.create({
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EEF3FA',
    overflow: 'hidden',
  },
  gridLineH: {
    position: 'absolute', left: 0, right: 0,
    height: 1, backgroundColor: 'rgba(26,111,255,0.07)',
  },
  gridLineV: {
    position: 'absolute', top: 0, bottom: 0,
    width: 1, backgroundColor: 'rgba(26,111,255,0.07)',
  },
  roadH1: {
    position: 'absolute', left: 0, right: 0,
    top: '42%', height: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(26,111,255,0.12)',
  },
  roadH2: {
    position: 'absolute', left: 0, right: 0,
    top: '68%', height: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(26,111,255,0.10)',
  },
  roadV1: {
    position: 'absolute', top: 0, bottom: 0,
    left: '35%', width: 5,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: 'rgba(26,111,255,0.12)',
  },
  roadV2: {
    position: 'absolute', top: 0, bottom: 0,
    left: '62%', width: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: 'rgba(26,111,255,0.10)',
  },
  cityLabel: {
    position: 'absolute', top: 14, left: 14,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
    ...Shadow.sm,
  },
  cityLabelText: {
    fontSize: 11, color: Colors.primary,
    fontWeight: '700',
  },
  markerBubble: {
    position: 'absolute',
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    ...Shadow.card,
  },
  markerSelected: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 3, borderColor: '#111',
    marginLeft: -5, marginTop: -5,
  },
  sea: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '14%',
    backgroundColor: '#B5D0E8',
    borderTopRightRadius: 80,
  },
  roadDiag: {
    position: 'absolute',
    top: '32%', left: '25%',
    width: '65%', height: 5,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(26,111,255,0.10)',
    transform: [{ rotate: '-34deg' }],
  },
  watermark: {
    position: 'absolute', bottom: 16, right: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8,
  },
  watermarkText: { fontSize: 10, color: Colors.textMuted },
});
