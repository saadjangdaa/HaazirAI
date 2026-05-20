import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

const NAV_BG = '#111827';
const ACTIVE_BG = '#FFFFFF';
const ACTIVE_COLOR = '#111827';
const INACTIVE_COLOR = 'rgba(255,255,255,0.50)';

interface FloatingTabBarProps extends BottomTabBarProps {
  accentColor?: string;
}

export default function FloatingTabBar({ state, descriptors, navigation, accentColor }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
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
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
            >
              <View style={[styles.tabInner, isFocused && styles.tabInnerActive]}>
                <Ionicons name={iconName} size={20} color={color} />
                <Text style={[styles.label, { color }]}>{label}</Text>
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
    // Customer routes
    index: ['home', 'home-outline'],
    bookings: ['calendar', 'calendar-outline'],
    disputes: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'],
    profile: ['person', 'person-outline'],
    // Worker routes
    jobs: ['briefcase', 'briefcase-outline'],
    earnings: ['cash', 'cash-outline'],
    route: ['navigate', 'navigate-outline'],
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
    // Transparent so screen content shows through below the bar
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    backgroundColor: NAV_BG,
    borderRadius: Radius.xxl,
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 20,
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.xl,
  },
  tabInnerActive: {
    backgroundColor: ACTIVE_BG,
    paddingHorizontal: 14,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
