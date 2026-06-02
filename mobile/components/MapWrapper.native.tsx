/**
 * Real Google Maps via react-native-maps.
 * Shows live provider markers (InDriver-style) on an actual map tile.
 */
import React, { useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
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

export function MapSection({ mapRef, userLocation, selectedProvider, onMarkerPress }: Props) {
  const initialRegion = userLocation
    ? { ...userLocation, latitudeDelta: 0.048, longitudeDelta: 0.048 }
    : DEFAULT_REGION;

  const renderMarker = useCallback((worker: NearbyWorker) => {
    const isSelected = selectedProvider?.id === worker.id;
    const color = worker.available
      ? (SERVICE_COLORS[worker.service] || Colors.primary)
      : '#BBBBBB';
    const size = isSelected ? 48 : 36;

    return (
      <Marker
        key={worker.id}
        coordinate={{ latitude: worker.lat, longitude: worker.lng }}
        onPress={() => onMarkerPress(worker)}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
      >
        <View style={[
          styles.markerOuter,
          {
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: color,
            borderWidth: isSelected ? 3 : 2,
            borderColor: isSelected ? '#0A0A0A' : '#FFFFFF',
          },
        ]}>
          <Ionicons
            name={(SERVICE_ICONS[worker.service] || 'person-outline') as any}
            size={isSelected ? 20 : 15}
            color="#fff"
          />
          {!worker.available && <View style={styles.busyDot} />}
        </View>

        {/* Name label shown only when selected */}
        {isSelected && (
          <View style={styles.nameBubble}>
            <Text style={styles.nameText} numberOfLines={1}>{worker.name}</Text>
            <Text style={styles.nameSub}>{worker.service}</Text>
          </View>
        )}
      </Marker>
    );
  }, [selectedProvider, onMarkerPress]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      initialRegion={initialRegion}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      showsScale={false}
      toolbarEnabled={false}
      mapPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
    >
      {MOCK_NEARBY_WORKERS.map(renderMarker)}
    </MapView>
  );
}

const styles = StyleSheet.create({
  markerOuter: {
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.card,
  },
  busyDot: {
    position: 'absolute',
    top: 2, right: 2,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5, borderColor: '#fff',
  },
  nameBubble: {
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    alignItems: 'center',
    minWidth: 90,
    maxWidth: 140,
    ...Shadow.sm,
  },
  nameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111',
  },
  nameSub: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});
