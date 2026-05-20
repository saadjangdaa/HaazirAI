/**
 * Mock Karachi map — works without any Google Maps API key.
 * Draws roads, sea, neighbourhood zones and worker markers
 * using pure React Native Views (no react-native-maps dependency).
 */
import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, Shadow } from '../constants/theme';
import { MOCK_NEARBY_WORKERS, NearbyWorker } from '../data/mockData';

export { Location };

// ─── Map coordinate bounds (Karachi central/north/east) ───────────────────────
const LAT_MAX = 24.960;   // top  (north)
const LAT_MIN = 24.820;   // bottom (south – just below the coast)
const LNG_MIN = 66.920;   // left  (west)
const LNG_MAX = 67.180;   // right (east)
const LAT_SPAN = LAT_MAX - LAT_MIN;   // 0.14
const LNG_SPAN = LNG_MAX - LNG_MIN;   // 0.26

export const DEFAULT_REGION = {
  latitude: (LAT_MAX + LAT_MIN) / 2,
  longitude: (LNG_MIN + LNG_MAX) / 2,
  latitudeDelta: LAT_SPAN,
  longitudeDelta: LNG_SPAN,
};

// ─── Coordinate projection ────────────────────────────────────────────────────
function proj(lat: number, lng: number, W: number, H: number) {
  return {
    x: ((lng - LNG_MIN) / LNG_SPAN) * W,
    y: ((LAT_MAX - lat) / LAT_SPAN) * H,
  };
}

// ─── Colour maps ──────────────────────────────────────────────────────────────
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

// ─── Road descriptor ──────────────────────────────────────────────────────────
interface Road {
  lat1: number; lng1: number;
  lat2: number; lng2: number;
  thick: number;
  color: string;
}

const ROADS: Road[] = [
  // Shahrah-e-Faisal  (diagonal, airport → Saddar)
  { lat1: 24.916, lng1: 67.176, lat2: 24.856, lng2: 67.010, thick: 5, color: '#C8CDD8' },
  // University Road  (horizontal, Gulshan belt)
  { lat1: 24.907, lng1: 66.980, lat2: 24.907, lng2: 67.145, thick: 4, color: '#C8CDD8' },
  // Northern Bypass  (top of map)
  { lat1: 24.947, lng1: 66.950, lat2: 24.947, lng2: 67.160, thick: 4, color: '#BFC5D2' },
  // M.A. Jinnah Road  (Saddar belt)
  { lat1: 24.862, lng1: 66.990, lat2: 24.862, lng2: 67.100, thick: 4, color: '#C8CDD8' },
  // Korangi / Drigh Road  (right vertical)
  { lat1: 24.945, lng1: 67.130, lat2: 24.858, lng2: 67.130, thick: 3, color: '#D0D5DF' },
  // Garden Road  (central vertical)
  { lat1: 24.930, lng1: 67.020, lat2: 24.853, lng2: 67.020, thick: 3, color: '#D0D5DF' },
  // Tariq Road  (PECHS area, shorter horizontal)
  { lat1: 24.875, lng1: 67.070, lat2: 24.875, lng2: 67.130, thick: 3, color: '#D0D5DF' },
  // Rashid Minhas Road  (mid horizontal)
  { lat1: 24.892, lng1: 67.050, lat2: 24.892, lng2: 67.145, thick: 3, color: '#D0D5DF' },
  // Lyari Expressway  (lower-left slight diagonal)
  { lat1: 24.860, lng1: 66.970, lat2: 24.852, lng2: 67.040, thick: 3, color: '#C8CDD8' },
  // Ahsanabad Road  (north-east small diagonal)
  { lat1: 24.940, lng1: 67.080, lat2: 24.910, lng2: 67.060, thick: 2, color: '#D8DCE6' },
  // North Karachi link
  { lat1: 24.950, lng1: 67.035, lat2: 24.920, lng2: 67.045, thick: 2, color: '#D8DCE6' },
];

// ─── Neighbourhood labels ─────────────────────────────────────────────────────
const ZONES = [
  { label: 'Gulshan',    lat: 24.912, lng: 67.106 },
  { label: 'North Nzbd',lat: 24.912, lng: 67.062 },
  { label: 'PECHS',      lat: 24.875, lng: 67.101 },
  { label: 'Saddar',     lat: 24.857, lng: 67.012 },
  { label: 'Malir',      lat: 24.924, lng: 67.134 },
  { label: 'Gulberg',    lat: 24.907, lng: 67.073 },
  { label: 'Defence',    lat: 24.848, lng: 67.075 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Props = {
  mapRef?: React.RefObject<any>;
  userLocation: { latitude: number; longitude: number } | null;
  selectedProvider: NearbyWorker | null;
  onMarkerPress: (worker: NearbyWorker) => void;
};

// ─── MapSection ───────────────────────────────────────────────────────────────
export function MapSection({ userLocation, selectedProvider, onMarkerPress }: Props) {
  const { width: W, height: SH } = useWindowDimensions();
  const H = SH;  // full screen height – parent clips it

  const roads = useMemo(() => ROADS.map((r) => {
    const p1 = proj(r.lat1, r.lng1, W, H);
    const p2 = proj(r.lat2, r.lng2, W, H);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    return { ...r, len, angle, cx, cy };
  }), [W, H]);

  const zones = useMemo(() => ZONES.map((z) => ({
    ...z,
    ...proj(z.lat, z.lng, W, H),
  })), [W, H]);

  const workers = useMemo(() => MOCK_NEARBY_WORKERS.map((w) => ({
    ...w,
    ...proj(w.lat, w.lng, W, H),
  })), [W, H]);

  const userPt = useMemo(() => userLocation
    ? proj(userLocation.latitude, userLocation.longitude, W, H)
    : proj(24.892, 67.092, W, H),   // default centre of Karachi
  [userLocation, W, H]);

  // Arabian Sea coastline shapes
  const seaY = proj(24.838, 0, W, H).y;     // ~86% H
  const coastX = proj(0, 67.040, W, H).x;   // ~46% W

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.base]}>

      {/* ── Sea (Arabian Sea, bottom-left) ── */}
      <View style={[styles.seaMain, { top: seaY, left: 0, right: 0, bottom: 0 }]} />
      {/* Coastline curve — triangular notch cut out of the top-right of the sea */}
      <View style={[styles.seaCorner, { top: seaY - 60, left: 0, width: coastX + 40, height: 80 }]} />

      {/* ── Green / park blobs ── */}
      <View style={[styles.parkBlob, {
        left: proj(0, 67.060, W, H).x, top: proj(24.892, 0, W, H).y,
        width: 28, height: 18,
      }]} />
      <View style={[styles.parkBlob, {
        left: proj(0, 67.098, W, H).x, top: proj(24.876, 0, W, H).y,
        width: 22, height: 14,
      }]} />

      {/* ── Roads ── */}
      {roads.map((r, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: r.cx,
            top: r.cy,
            width: r.len,
            height: r.thick,
            backgroundColor: r.color,
            transform: [
              { translateX: -r.len / 2 },
              { translateY: -r.thick / 2 },
              { rotate: `${r.angle}deg` },
            ],
          }}
        />
      ))}

      {/* ── Road labels (just the two most iconic) ── */}
      <RoadLabel
        text="Shahrah-e-Faisal"
        x={proj(24.886, 67.093, W, H).x - 54}
        y={proj(24.886, 67.093, W, H).y - 8}
        angle={-34}
      />
      <RoadLabel
        text="University Road"
        x={proj(24.907, 67.062, W, H).x}
        y={proj(24.907, 67.062, W, H).y - 8}
        angle={0}
      />

      {/* ── Neighbourhood labels ── */}
      {zones.map((z) => (
        <View key={z.label} style={[styles.zoneLabel, { left: z.x - 24, top: z.y }]}>
          <Text style={styles.zoneLabelText}>{z.label}</Text>
        </View>
      ))}

      {/* ── City watermark ── */}
      <View style={styles.cityBadge}>
        <Ionicons name="location" size={11} color={Colors.primary} />
        <Text style={styles.cityBadgeText}>Karachi, Pakistan</Text>
      </View>

      {/* ── User location pin ── */}
      <View style={[styles.userRing, { left: userPt.x - 20, top: userPt.y - 20 }]}>
        <View style={styles.userDot} />
      </View>

      {/* ── Worker markers ── */}
      {workers.map((w) => {
        const selected = selectedProvider?.id === w.id;
        const color = w.available ? (SERVICE_COLORS[w.service] || Colors.primary) : '#BBBBBB';
        const size = selected ? 42 : 32;
        return (
          <TouchableOpacity
            key={w.id}
            activeOpacity={0.85}
            onPress={() => onMarkerPress(w)}
            style={[
              styles.marker,
              {
                left: w.x - size / 2,
                top: w.y - size / 2,
                width: size, height: size, borderRadius: size / 2,
                backgroundColor: color,
                borderWidth: selected ? 3 : 2,
                borderColor: selected ? '#111' : '#fff',
              },
            ]}
          >
            <Ionicons
              name={(SERVICE_ICONS[w.service] || 'person-outline') as any}
              size={selected ? 16 : 13}
              color="#fff"
            />
            {!w.available && (
              <View style={styles.busyDot} />
            )}
          </TouchableOpacity>
        );
      })}

      {/* ── Scale bar ── */}
      <View style={styles.scaleBar}>
        <View style={styles.scaleLine} />
        <Text style={styles.scaleText}>~2 km</Text>
      </View>
    </View>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function RoadLabel({ text, x, y, angle }: { text: string; x: number; y: number; angle: number }) {
  return (
    <Text
      style={[
        styles.roadLabel,
        { left: x, top: y, transform: [{ rotate: `${angle}deg` }] },
      ]}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  base: {
    backgroundColor: '#E9EDF5',   // land colour
    overflow: 'hidden',
  },

  // Sea
  seaMain: {
    position: 'absolute',
    backgroundColor: '#B5D0E8',
  },
  seaCorner: {
    position: 'absolute',
    backgroundColor: '#B5D0E8',
    borderTopRightRadius: 120,
  },

  // Parks
  parkBlob: {
    position: 'absolute',
    backgroundColor: 'rgba(52,199,89,0.25)',
    borderRadius: 6,
  },

  // Zone labels
  zoneLabel: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  zoneLabelText: {
    fontSize: 9,
    color: '#5A6373',
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Road label
  roadLabel: {
    position: 'absolute',
    fontSize: 8,
    color: '#8892A0',
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // City badge (top-left)
  cityBadge: {
    position: 'absolute',
    top: 12, left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 20,
    ...Shadow.sm,
  },
  cityBadgeText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '700',
  },

  // User location
  userRing: {
    position: 'absolute',
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(26,111,255,0.4)',
    backgroundColor: 'rgba(26,111,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  userDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.primary,
    borderWidth: 2, borderColor: '#fff',
    ...Shadow.sm,
  },

  // Worker markers
  marker: {
    position: 'absolute',
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.card,
  },
  busyDot: {
    position: 'absolute',
    top: 2, right: 2,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5, borderColor: '#fff',
  },

  // Scale bar (bottom-right)
  scaleBar: {
    position: 'absolute',
    bottom: 14, right: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    alignItems: 'center',
    ...Shadow.sm,
  },
  scaleLine: {
    width: 44, height: 2,
    backgroundColor: '#5A6373',
    marginBottom: 2,
    borderRadius: 1,
  },
  scaleText: { fontSize: 9, color: '#5A6373', fontWeight: '600' },
});
