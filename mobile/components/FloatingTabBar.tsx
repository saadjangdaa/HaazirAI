import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight } from '../constants/theme';

const ACTIVE   = Colors.primary;
const INACTIVE = '#9CA3AF';

export default function FlatTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label  = (options.tabBarLabel ?? options.title ?? route.name) as string;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
          >
            {isFocused && <View style={styles.indicator} />}
            <Ionicons
              name={getIcon(route.name, isFocused)}
              size={22}
              color={isFocused ? ACTIVE : INACTIVE}
            />
            <Text style={[styles.label, { color: isFocused ? ACTIVE : INACTIVE }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function getIcon(routeName: string, focused: boolean): any {
  const map: Record<string, [string, string]> = {
    index:    ['home',                  'home-outline'],
    bookings: ['calendar',              'calendar-outline'],
    disputes: ['chatbubble-ellipses',   'chatbubble-ellipses-outline'],
    profile:  ['person',                'person-outline'],
    jobs:     ['briefcase',             'briefcase-outline'],
    earnings: ['cash',                  'cash-outline'],
    route:    ['navigate',              'navigate-outline'],
  };
  const [on, off] = map[routeName] ?? ['apps', 'apps-outline'];
  return focused ? on : off;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    position: 'relative',
    paddingBottom: 2,
  },
  indicator: {
    position: 'absolute',
    top: -10,
    left: '28%',
    right: '28%',
    height: 2.5,
    backgroundColor: Colors.primary,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.1,
  },
});
