// Dynamic Expo config — reads GOOGLE_MAPS_API_KEY from .env at build/start time.
// Expo automatically loads .env before evaluating this file.
// Variables without EXPO_PUBLIC_ prefix are available here but NOT in the JS bundle (secure).

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

/** @param {{ config: import('@expo/config-types').ExpoConfig }} param0 */
export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: MAPS_KEY || config.android?.config?.googleMaps?.apiKey,
      },
    },
  },
  ios: {
    ...config.ios,
    config: {
      ...config.ios?.config,
      googleMapsApiKey: MAPS_KEY || config.ios?.config?.googleMapsApiKey,
    },
  },
  plugins: (config.plugins || []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'react-native-maps') {
      return [
        'react-native-maps',
        { googleMapsApiKey: MAPS_KEY || plugin[1]?.googleMapsApiKey },
      ];
    }
    return plugin;
  }),
});
