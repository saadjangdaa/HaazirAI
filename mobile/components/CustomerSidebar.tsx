import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Dimensions, Switch, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useMockData } from '../context/MockDataContext';
import { useLang } from '../context/LanguageContext';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.min(300, SCREEN_W * 0.82);

type SidebarItem = {
  label: string;
  icon: string;
  path?: string;
  badge?: string;
  highlight?: boolean;
  dividerBefore?: boolean;
};

// Nav items built dynamically inside the component using tr

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function CustomerSidebar({ visible, onClose }: Props) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isMockMode, toggleMockMode } = useMockData();
  const { tr } = useLang();
  const insets = useSafeAreaInsets();

  const SIDEBAR_NAV: SidebarItem[] = [
    { label: tr.navHome,       icon: 'home-outline',          path: '/(customer)/' },
    { label: tr.navBookings,   icon: 'calendar-outline',      path: '/(customer)/bookings' },
    { label: tr.navDisputes,   icon: 'shield-outline',        path: '/(customer)/disputes' },
    { label: tr.navProfile,    icon: 'person-outline',        path: '/(customer)/profile' },
    { label: 'Agent Traces',   icon: 'git-network-outline',   path: '/agent-traces', highlight: true, badge: 'NEW', dividerBefore: true },
    { label: tr.agentLogs,     icon: 'flask-outline',         path: '/logs' },
    { label: 'Nearby Workers', icon: 'people-outline',        path: '/nearby', dividerBefore: true },
    { label: 'Notifications',  icon: 'notifications-outline', path: '/logs' },
    { label: 'Help & Support', icon: 'help-circle-outline' },
  ];

  const drawerAnim = useRef(new Animated.Value(0)).current;

  const drawerTranslateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SIDEBAR_W, 0],
  });
  const overlayOpacity = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });

  useEffect(() => {
    if (visible) {
      Animated.spring(drawerAnim, {
        toValue: 1, useNativeDriver: true, tension: 65, friction: 11,
      }).start();
    } else {
      Animated.timing(drawerAnim, {
        toValue: 0, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleNav = (path?: string) => {
    onClose();
    if (path) setTimeout(() => router.push(path as any), 230);
  };

  const handleLogout = () => {
    onClose();
    setTimeout(() => {
      Alert.alert('Logout', 'Kya aap logout karna chahte hain?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout', style: 'destructive', onPress: () => {
            signOut()
              .catch(() => {})
              .finally(() => router.replace('/login'));
          },
        },
      ]);
    }, 250);
  };

  const displayName = user?.username || user?.name || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  if (!visible && (drawerAnim as any)._value === 0) return null;

  return (
    <>
      {/* Overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, s.overlay, { opacity: overlayOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[s.sidebar, { transform: [{ translateX: drawerTranslateX }], paddingTop: insets.top }]}>
        {/* Close button */}
        <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>

        {/* Profile */}
        <View style={s.profile}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{isMockMode ? 'Ahmed Ali' : displayName}</Text>
            <Text style={s.email} numberOfLines={1}>{isMockMode ? 'ahmed.ali@gmail.com' : (user?.email || '')}</Text>
            <View style={s.badge}>
              <Text style={s.badgeText}>Loyal Customer ⭐</Text>
            </View>
          </View>
        </View>

        {/* Nav items */}
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          {SIDEBAR_NAV.map((item) => (
            <View key={item.label}>
              {item.dividerBefore && <View style={s.divider} />}
              <TouchableOpacity style={s.item} onPress={() => handleNav(item.path)} activeOpacity={0.75}>
                <View style={[s.itemIcon, item.highlight && s.itemIconHighlight]}>
                  <Ionicons name={item.icon as any} size={18} color={item.highlight ? Colors.primary : Colors.textSecondary} />
                </View>
                <Text style={[s.itemLabel, item.highlight && { color: Colors.primary, fontWeight: FontWeight.bold }]}>
                  {item.label}
                </Text>
                {item.badge && (
                  <View style={s.itemBadge}>
                    <Text style={s.itemBadgeText}>{item.badge}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={15} color={Colors.border} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={s.divider} />

          {/* Demo Mode toggle */}
          <View style={s.toggleRow}>
            <View style={s.itemIcon}>
              <Ionicons name="color-wand-outline" size={18} color={Colors.textSecondary} />
            </View>
            <Text style={s.itemLabel}>{tr.demoMode}</Text>
            <Switch
              value={isMockMode}
              onValueChange={toggleMockMode}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={isMockMode ? Colors.textInverse : Colors.textMuted}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          <View style={s.divider} />

          {/* Logout */}
          <TouchableOpacity style={s.logout} onPress={handleLogout} activeOpacity={0.75}>
            <View style={[s.itemIcon, { backgroundColor: Colors.dangerDim }]}>
              <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            </View>
            <Text style={[s.itemLabel, { color: Colors.danger }]}>{tr.logout}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={s.footerText}>Haazir AI v1.0 · Google Hackathon</Text>
        </View>
      </Animated.View>
    </>
  );
}

const s = StyleSheet.create({
  overlay: { backgroundColor: '#000' },
  sidebar: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    width: SIDEBAR_W,
    backgroundColor: Colors.surface,
    ...Shadow.modal,
    borderTopRightRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    zIndex: 100,
  },
  closeBtn: {
    position: 'absolute', top: 52, right: 14,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1,
  },
  profile: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.primaryLight,
    borderBottomWidth: 1, borderBottomColor: Colors.primaryDim,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.primary,
  },
  avatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: '#fff' },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 2 },
  email: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 5 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  badgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold },

  scroll: { flex: 1 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xs, marginHorizontal: Spacing.md },

  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13,
    gap: Spacing.sm,
  },
  itemIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  itemIconHighlight: { backgroundColor: Colors.primaryLight },
  itemLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  itemBadge: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 2, marginRight: 4,
  },
  itemBadgeText: { fontSize: 10, color: '#fff', fontWeight: FontWeight.bold },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    gap: Spacing.sm,
  },
  logout: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13,
    gap: Spacing.sm,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
    padding: Spacing.md, alignItems: 'center',
  },
  footerText: { fontSize: 11, color: Colors.textMuted },
});
