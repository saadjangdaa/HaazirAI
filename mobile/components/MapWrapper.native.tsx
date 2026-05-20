import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
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
  mapRef: React.RefObject<any>;
  userLocation: { latitude: number; longitude: number } | null;
  selectedProvider: NearbyWorker | null;
  onMarkerPress: (worker: NearbyWorker) => void;
};

export function MapSection({ mapRef, userLocation, selectedProvider, onMarkerPress }: Props) {
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={Platform.OS === 'android' ? 'google' : undefined}
      initialRegion={DEFAULT_REGION}
      showsUserLocation={!!userLocation}
      showsMyLocationButton={false}
      showsCompass={false}
      showsTraffic={false}
      rotateEnabled={false}
    >
      {MOCK_NEARBY_WORKERS.map((worker) => (
        <Marker
          key={worker.id}
          coordinate={{ latitude: worker.lat, longitude: worker.lng }}
          onPress={() => onMarkerPress(worker)}
          tracksViewChanges={false}
        >
          <MarkerBubble
            worker={worker}
            selected={selectedProvider?.id === worker.id}
            serviceColors={SERVICE_COLORS}
            serviceIcons={SERVICE_ICONS}
          />
        </Marker>
      ))}
      {userLocation && (
        <Circle
          center={userLocation}
          radius={300}
          strokeColor="rgba(26,111,255,0.45)"
          strokeWidth={1.5}
          fillColor="rgba(26,111,255,0.10)"
        />
      )}
    </MapView>
  );
}

function MarkerBubble({
  worker, selected, serviceColors, serviceIcons,
}: {
  worker: NearbyWorker;
  selected: boolean;
  serviceColors: Record<string, string>;
  serviceIcons: Record<string, string>;
}) {
  return (
    <Ionicons
      name={(serviceIcons[worker.service] || 'person-outline') as any}
      size={13}
      color="#fff"
      style={[
        styles.markerBubble,
        { backgroundColor: worker.available ? (serviceColors[worker.service] || Colors.primary) : '#BBBBBB' },
        selected && styles.markerBubbleSelected,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  markerBubble: {
    width: 34, height: 34, borderRadius: 17,
    textAlign: 'center', textAlignVertical: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    overflow: 'hidden',
  },
  markerBubbleSelected: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 3, borderColor: '#111',
  },
});
