import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Shadow } from '../constants/theme';

const TABS = [
  { label: 'Jobs',      icon: 'briefcase-outline',    activeIcon: 'briefcase',          path: '/(worker)/jobs'     },
  { label: 'Earnings',  icon: 'cash-outline',          activeIcon: 'cash',               path: '/(worker)/earnings' },
  { label: 'Route',     icon: 'map-outline',           activeIcon: 'map',                path: '/(worker)/route'    },
  { label: 'Profile',   icon: 'person-outline',        activeIcon: 'person',             path: '/(worker)/profile'  },
] as const;

export default function WorkerTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || 8 }, Shadow.modal]}>
      {TABS.map((tab) => {
        const active = pathname === tab.path || pathname.startsWith(tab.path);
        return (
          <TouchableOpacity
            key={tab.path}
            style={styles.tab}
            onPress={() => router.push(tab.path as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Ionicons
                name={(active ? tab.activeIcon : tab.icon) as any}
                size={20}
                color={active ? Colors.primary : Colors.textMuted}
              />
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 36, height: 28,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: 14,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(26,111,255,0.10)',
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  labelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
});
