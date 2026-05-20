import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

const NAV_BG = '#FFFFFF';
const ACTIVE_BG = '#1A6FFF';
const ACTIVE_COLOR = '#FFFFFF';
const INACTIVE_COLOR = '#9CA3AF';

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom > 0 ? insets.bottom : 14 }]}>
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = (options.tabBarLabel ?? options.title ?? route.name) as string;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          const iconName = getIcon(route.name, isFocused);
          const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;

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
              <View style={[styles.tabInner, isFocused && styles.tabInnerActive]}>
                <Ionicons name={iconName} size={20} color={color} />
                <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function getIcon(routeName: string, focused: boolean): any {
  const map: Record<string, [string, string]> = {
    index:    ['home', 'home-outline'],
    bookings: ['calendar', 'calendar-outline'],
    disputes: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'],
    profile:  ['person', 'person-outline'],
    jobs:     ['briefcase', 'briefcase-outline'],
    earnings: ['cash', 'cash-outline'],
    route:    ['navigate', 'navigate-outline'],
  };
  const [on, off] = map[routeName] ?? ['apps', 'apps-outline'];
  return focused ? on : off;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    backgroundColor: NAV_BG,
    borderRadius: Radius.xxl,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: '#1A6FFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: Radius.xl,
  },
  tabInnerActive: {
    backgroundColor: ACTIVE_BG,
    paddingHorizontal: 16,
    shadowColor: '#1A6FFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
});
