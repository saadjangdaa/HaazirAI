/**
 * Static Google Maps image background with interactive worker markers overlaid.
 * Replaces the dynamic MapView to avoid blank-screen issues on native builds.
 */
import React from 'react';
import { View, Image, StyleSheet, Text, TouchableOpacity, Dimensions } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow } from '../constants/theme';
import { MOCK_NEARBY_WORKERS, NearbyWorker } from '../data/mockData';

export { Location };

export const DEFAULT_REGION = {
  latitude: 24.8907,
  longitude: 67.0968,
  latitudeDelta: 0.048,
  longitudeDelta: 0.048,
};

const MAPS_API_KEY = 'AIzaSyBrk1qwmRpVbhH_URNwS_d0P8iVuRCFzoM';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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

const clamp = (val: number, min: number, max: number) =>
  Math.min(Math.max(val, min), max);

function buildStaticMapUrl(lat: number, lng: number): string {
  const size = `${Math.min(640, Math.round(SCREEN_W))}x${Math.min(640, Math.round(SCREEN_H))}`;
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=14` +
    `&size=${size}` +
    `&scale=2` +
    `&style=feature:poi|visibility:off` +
    `&style=feature:transit|visibility:off` +
    `&key=${MAPS_API_KEY}`
  );
}

export function MapSection({ userLocation, selectedProvider, onMarkerPress }: Props) {
  const center = userLocation ?? { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude };
  const mapUrl = buildStaticMapUrl(center.latitude, center.longitude);

  // Convert worker lat/lng to percentage position on the static map tile.
  // The map is centered at `center` with zoom 14 (≈ 0.048° span each side).
  const latSpan = 0.048;
  const lngSpan = 0.048;

  function workerTop(lat: number): string {
    const pct = clamp(50 - ((lat - center.latitude) / latSpan) * 50, 5, 92);
    return `${pct}%`;
  }
  function workerLeft(lng: number): string {
    const pct = clamp(50 + ((lng - center.longitude) / lngSpan) * 50, 5, 92);
    return `${pct}%`;
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* Static map tile */}
      <Image
        source={{ uri: mapUrl }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* User location dot */}
      <View style={[styles.userDot, { top: '50%', left: '50%', marginTop: -10, marginLeft: -10 }]}>
        <View style={styles.userDotInner} />
      </View>

      {/* City label */}
      <View style={styles.cityLabel}>
        <Ionicons name="location" size={12} color={Colors.primary} />
        <Text style={styles.cityLabelText}>Karachi, Pakistan</Text>
      </View>

      {/* Worker markers */}
      {MOCK_NEARBY_WORKERS.map((worker) => {
        const isSelected = selectedProvider?.id === worker.id;
        const color = worker.available
          ? (SERVICE_COLORS[worker.service] || Colors.primary)
          : '#BBBBBB';
        const size = isSelected ? 44 : 34;

        return (
          <TouchableOpacity
            key={worker.id}
            activeOpacity={0.85}
            onPress={() => onMarkerPress(worker)}
            style={[
              styles.markerBubble,
              {
                top: workerTop(worker.lat) as any,
                left: workerLeft(worker.lng) as any,
                width: size, height: size, borderRadius: size / 2,
                backgroundColor: color,
                marginTop: -(size / 2),
                marginLeft: -(size / 2),
                borderWidth: isSelected ? 3 : 2,
                borderColor: isSelected ? '#0A0A0A' : '#FFFFFF',
              },
            ]}
          >
            <Ionicons
              name={(SERVICE_ICONS[worker.service] || 'person-outline') as any}
              size={isSelected ? 18 : 14}
              color="#fff"
            />
          </TouchableOpacity>
        );
      })}

      {/* Map attribution watermark */}
      <View style={styles.watermark}>
        <Text style={styles.watermarkText}>Map data ©2024 Google</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userDot: {
    position: 'absolute',
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(26,111,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  userDotInner: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#1A6FFF',
    borderWidth: 2, borderColor: '#fff',
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
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.card,
  },
  watermark: {
    position: 'absolute', bottom: 6, right: 8,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
  },
  watermarkText: { fontSize: 9, color: '#555' },
});
