import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Easing, Alert, StatusBar,
  Dimensions, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../../constants/theme';
import { pingApi, requireUserId, getUserBookings, createJobRequest } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { useMockData } from '../../context/MockDataContext';
import { MOCK_NEARBY_WORKERS, NearbyWorker, MOCK_RECENT_REQUESTS } from '../../data/mockData';
// Platform-specific map + location — Metro picks .native.tsx or .web.tsx automatically
import { MapSection, Location } from '../../components/MapWrapper';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SIDEBAR_W = Math.min(300, SCREEN_W * 0.82);
const SHEET_COLLAPSED = 272;
const SHEET_EXPANDED = Math.min(Math.round(SCREEN_H * 0.56), 500);



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

const QUICK_SERVICES = [
  { label: 'AC Repair',   icon: 'snow-outline'     as const },
  { label: 'Plumber',     icon: 'water-outline'    as const },
  { label: 'Electrician', icon: 'flash-outline'    as const },
  { label: 'Tutor',       icon: 'book-outline'     as const },
  { label: 'Beautician',  icon: 'sparkles-outline' as const },
  { label: 'Carpenter',   icon: 'hammer-outline'   as const },
  { label: 'Emergency',   icon: 'warning-outline'  as const, danger: true },
];

type SidebarItem = {
  label: string;
  icon: string;
  path?: string;
  badge?: string;
  highlight?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
};


const CustomerHomeScreen = () => {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { tr } = useLang();
  const { isMockMode, toggleMockMode } = useMockData();

  const SIDEBAR_NAV: SidebarItem[] = [
    { label: tr.navHome,      icon: 'home-outline',          path: '/(customer)/' },
    { label: tr.navBookings,  icon: 'calendar-outline',      path: '/(customer)/bookings' },
    { label: 'Meri Chats',    icon: 'chatbubbles-outline',   path: '/voice-chats' },
    { label: tr.navDisputes,  icon: 'shield-outline',        path: '/(customer)/disputes' },
    { label: tr.navProfile,   icon: 'person-outline',        path: '/(customer)/profile' },
    { label: 'Agent Traces',  icon: 'git-network-outline',   path: '/agent-traces', highlight: true, badge: 'NEW', dividerBefore: true },
    { label: tr.agentLogs,    icon: 'flask-outline',         path: '/logs' },
    { label: 'Nearby Workers', icon: 'people-outline',       path: '/nearby', dividerBefore: true },
    { label: 'Notifications', icon: 'notifications-outline', path: '/logs' },
    { label: 'Help & Support', icon: 'help-circle-outline' },
  ];
  const insets = useSafeAreaInsets();

  const [input, setInput] = useState('');
  const [location, setLocation] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [apiWakingUp, setApiWakingUp] = useState(false);
  const [recentRequests, setRecentRequests] = useState<string[]>([]);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<NearbyWorker | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sheetAnim   = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const drawerAnim  = useRef(new Animated.Value(0)).current;
  const mapRef      = useRef<any>(null);

  const drawerTranslateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SIDEBAR_W, 0],
  });
  const overlayOpacity = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (user?.city && !location) setLocation(user.city);
  }, [user?.city]);

  useEffect(() => {
    let mounted = true;
    let attempt = 0;
    const MAX_ATTEMPTS = 4;
    const RETRY_MS = [15000, 20000, 25000]; // 15s, 20s, 25s between retries

    const check = async () => {
      const { ok, url } = await pingApi();
      if (__DEV__) console.log(`[Haazir] ping attempt=${attempt} ok=${ok} url=${url}`);
      if (!mounted) return;
      setApiOk(ok);
      if (!ok && attempt < MAX_ATTEMPTS) {
        setApiWakingUp(true);
        const delay = RETRY_MS[attempt] ?? 25000;
        attempt++;
        setTimeout(check, delay);
      } else {
        setApiWakingUp(false);
      }
    };
    check();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (isMockMode) { setRecentRequests(MOCK_RECENT_REQUESTS); return; }
    if (!user?.id) return;
    let cancelled = false;
    try {
      const uid = requireUserId(user);
      getUserBookings(uid).then((bookings) => {
        if (cancelled) return;
        const names = bookings
          .slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .slice(0, 3).map((b) => b.service || '').filter(Boolean);
        setRecentRequests(names);
      }).catch(() => {});
    } catch {}
    return () => { cancelled = true; };
  }, [user?.id, isMockMode]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setUserLocation(coords);
          mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.048, longitudeDelta: 0.048 }, 1000);
        }
      } catch {}
    })();
  }, []);

  // ── Sidebar ───────────────────────────────────────────────────────────────

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.spring(drawerAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeSidebar = () => {
    Animated.timing(drawerAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setSidebarOpen(false));
  };

  const handleSidebarNav = (path?: string) => {
    closeSidebar();
    if (path) setTimeout(() => router.push(path as any), 230);
  };

  const handleLogout = () => {
    closeSidebar();
    setTimeout(() => {
      Alert.alert('Logout', 'Kya aap logout karna chahte hain?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: () => {
          signOut()
            .catch(() => {})
            .finally(() => router.replace('/login'));
        }},
      ]);
    }, 250);
  };

  // ── Sheet & Map ───────────────────────────────────────────────────────────

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 700, easing: Easing.ease, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
  };

  const animateSheet = (toValue: number) => {
    Animated.spring(sheetAnim, { toValue, useNativeDriver: false, tension: 65, friction: 11 }).start();
  };

  const toggleSheet = () => {
    if (selectedProvider) return;
    const next = !sheetExpanded;
    animateSheet(next ? SHEET_EXPANDED : SHEET_COLLAPSED);
    setSheetExpanded(next);
  };

  const handleMarkerPress = (worker: NearbyWorker) => {
    setSelectedProvider(worker);
    animateSheet(SHEET_COLLAPSED);
    setSheetExpanded(false);
    mapRef.current?.animateToRegion({
      latitude: worker.lat - 0.008,
      longitude: worker.lng,
      latitudeDelta: 0.032,
      longitudeDelta: 0.032,
    }, 600);
  };

  const clearSelectedProvider = () => {
    setSelectedProvider(null);
    animateSheet(SHEET_COLLAPSED);
  };

  // ── Voice ─────────────────────────────────────────────────────────────────

  const handleVoice = async () => {
    if (voiceProcessing) return;
    if (recording) {
      setRecording(false);
      stopPulse();
      setVoiceProcessing(true);
      try {
        const { stopAndTranscribe } = await import('../../services/voiceRecord');
        const { text } = await stopAndTranscribe();
        if (text) { setInput(text); router.push('/voice-conversation'); }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Network') || msg.includes('rabta')) {
          Alert.alert('Voice / Network', msg);
        } else {
          setInput('AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye');
          router.push('/voice-conversation');
        }
      } finally {
        setVoiceProcessing(false);
      }
    } else {
      try {
        const { requestMicPermission, startRecording } = await import('../../services/voiceRecord');
        const granted = await requestMicPermission();
        if (!granted) { Alert.alert('Permission Chahiye', 'Settings mein microphone access allow karein'); return; }
        await startRecording();
        setRecording(true);
        startPulse();
      } catch {
        Alert.alert('Voice', 'Recording unavailable — Talk to AI se baat karein');
      }
    }
  };

  const handleRealJobRequest = async (service: string, loc: string, urgency = 'medium') => {
    if (!user?.id) { router.push('/voice-conversation'); return; }
    try {
      const uid = requireUserId(user);
      const city = user.city || 'Islamabad';
      const job = await createJobRequest({
        user_id: uid,
        service,
        location: loc || city,
        city,
        urgency,
      });
      // Navigate to results with jobRequestId so it polls real bids
      router.push({
        pathname: '/results',
        params: {
          data: JSON.stringify({
            request_id: job.job_request_id,
            extracted_intent: { service_type: service, location: loc, city, urgency },
            providers_ranked: [],
            agent_logs: [],
          }),
          jobRequestId: job.job_request_id,
        },
      });
    } catch {
      // Fallback to voice conversation if API fails
      router.push('/voice-conversation');
    }
  };

  const handleQuickService = (label: string, danger?: boolean) => {
    const area = location.trim() || user?.city || 'G-13, Islamabad';
    if (danger) {
      setInput('EMERGENCY! Gas leak ho rahi hai, foran koi bhejein');
      router.push('/voice-conversation');
      return;
    }
    if (!isMockMode) {
      handleRealJobRequest(label, area);
      return;
    }
    setInput(`Mujhe ${label} chahiye — ${area}`);
    if (!location.trim()) setLocation(area);
    router.push('/voice-conversation');
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const firstName    = user?.username?.split(' ')[0] || '';
  const displayName  = user?.username || 'User';
  const initial      = displayName.charAt(0).toUpperCase();
  const availableCount = MOCK_NEARBY_WORKERS.filter(w => w.available).length;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── MAP ── */}
      <MapSection
        mapRef={mapRef}
        userLocation={userLocation}
        selectedProvider={selectedProvider}
        onMarkerPress={handleMarkerPress}
      />

      {/* ── HEADER OVERLAY ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          {/* Hamburger */}
          <TouchableOpacity style={styles.iconBtn} onPress={openSidebar} activeOpacity={0.8}>
            <Ionicons name="menu" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{tr.homeGreeting(firstName)}</Text>
            <View style={styles.availRow}>
              <View style={styles.greenDot} />
              <Text style={styles.availText}>{availableCount} workers available nearby</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/logs')}>
              <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
              <View style={styles.notifDot} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, styles.avatarBtn]} onPress={openSidebar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {apiOk === false && (
          <TouchableOpacity
            style={styles.apiBanner}
            onPress={() => { setApiWakingUp(false); pingApi().then(({ ok }) => setApiOk(ok)); }}
          >
            <Ionicons name={apiWakingUp ? 'hourglass-outline' : 'warning-outline'} size={12} color={apiWakingUp ? Colors.warning : Colors.danger} />
            <Text style={[styles.apiBannerText, apiWakingUp && { color: Colors.warning }]}>
              {apiWakingUp ? 'Server waking up (~20s)...' : 'Backend offline — tap to retry'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── BOTTOM SHEET ── */}
      <Animated.View style={[styles.sheet, { height: sheetAnim, paddingBottom: insets.bottom + 4 }]}>
        <TouchableOpacity onPress={toggleSheet} activeOpacity={0.6} style={styles.handleArea} disabled={!!selectedProvider}>
          <View style={styles.handle} />
        </TouchableOpacity>

        {selectedProvider ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.providerContent}>
            <TouchableOpacity onPress={clearSelectedProvider} style={styles.backRow}>
              <Ionicons name="chevron-back" size={18} color={Colors.primary} />
              <Text style={styles.backText}>Wapas jayen</Text>
            </TouchableOpacity>

            <View style={styles.providerHeader}>
              <View style={[styles.providerAvatar, { backgroundColor: SERVICE_COLORS[selectedProvider.service] || Colors.primary }]}>
                <Ionicons name={(SERVICE_ICONS[selectedProvider.service] || 'person') as any} size={24} color="#fff" />
              </View>
              <View style={styles.providerInfo}>
                <View style={styles.providerNameRow}>
                  <Text style={styles.providerName}>{selectedProvider.name}</Text>
                  {selectedProvider.verified && <Ionicons name="checkmark-circle" size={16} color={Colors.success} />}
                </View>
                <Text style={styles.providerService}>{selectedProvider.service}</Text>
                <View style={[styles.availBadge, !selectedProvider.available && styles.unavailBadge]}>
                  <Text style={[styles.availBadgeText, !selectedProvider.available && styles.unavailBadgeText]}>
                    {selectedProvider.available ? '● Available' : '● Busy'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNum}>⭐ {selectedProvider.rating}</Text>
                <Text style={styles.statLbl}>{selectedProvider.reviews} reviews</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{selectedProvider.distanceKm} km</Text>
                <Text style={styles.statLbl}>Aap se</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{selectedProvider.completedJobs}</Text>
                <Text style={styles.statLbl}>Jobs done</Text>
              </View>
            </View>

            <View style={styles.priceCard}>
              <View>
                <Text style={styles.priceLabel}>Rate (approx)</Text>
                <Text style={styles.priceVal}>
                  Rs {selectedProvider.priceMin.toLocaleString()} – {selectedProvider.priceMax.toLocaleString()}
                </Text>
              </View>
              <View style={styles.areaTag}>
                <Ionicons name="pin" size={12} color={Colors.primary} />
                <Text style={styles.areaTagText}>{selectedProvider.area}</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.bookBtn, !selectedProvider.available && styles.bookBtnDisabled]}
                onPress={() => {
                  if (!isMockMode) {
                    handleRealJobRequest(selectedProvider!.service, selectedProvider!.area);
                  } else {
                    setInput(`Mujhe ${selectedProvider!.service} chahiye — ${selectedProvider!.area}`);
                    setLocation(selectedProvider!.area);
                    router.push('/voice-conversation');
                  }
                }}
                activeOpacity={0.85}
                disabled={!selectedProvider.available}
              >
                <Ionicons name="calendar-outline" size={16} color="#fff" />
                <Text style={styles.bookBtnText}>Book Karein</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.aiBtn}
                onPress={() => router.push('/voice-conversation')}
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} />
                <Text style={styles.aiBtnText}>AI se Puchein</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.sheetInner}>
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>{tr.homeQuestion}</Text>
              <TouchableOpacity onPress={() => router.push('/agent-traces' as any)} style={styles.tracesBtn}>
                <Ionicons name="git-network-outline" size={13} color={Colors.primary} />
                <Text style={styles.tracesBtnText}>Traces</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={{ paddingRight: Spacing.md }}>
              {QUICK_SERVICES.map((s) => (
                <TouchableOpacity
                  key={s.label}
                  style={[styles.chip, s.danger && styles.chipDanger]}
                  onPress={() => handleQuickService(s.label, s.danger)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.chipIcon, s.danger && styles.chipIconDanger]}>
                    <Ionicons name={s.icon} size={20} color={s.danger ? Colors.danger : Colors.primary} />
                  </View>
                  <Text style={[styles.chipLabel, s.danger && styles.chipLabelDanger]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.voiceRow}>
              <Animated.View style={[styles.micOuter, { transform: [{ scale: pulseAnim }] }, recording && styles.micOuterActive]}>
                <TouchableOpacity
                  style={[styles.micBtn, recording && styles.micBtnActive]}
                  onPress={handleVoice}
                  disabled={voiceProcessing}
                  activeOpacity={0.85}
                >
                  {voiceProcessing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Ionicons name={recording ? 'stop' : 'mic'} size={22} color="#fff" />
                  }
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity style={styles.talkBtn} onPress={() => router.push('/voice-conversation')} activeOpacity={0.8}>
                <Ionicons name="chatbubble-ellipses-outline" size={15} color={Colors.primary} />
                <Text style={styles.talkBtnText}>{tr.talkToAI}</Text>
                <Ionicons name="arrow-forward" size={13} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {sheetExpanded && recentRequests.length > 0 && (
              <View style={styles.recentBox}>
                <Text style={styles.recentHeading}>{tr.recentActivity}</Text>
                {recentRequests.map((r, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.recentRow}
                    onPress={() => { setInput(r); router.push('/voice-conversation'); }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.recentText} numberOfLines={1}>{r}</Text>
                    <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {sheetExpanded && (
              <View style={styles.agentNote}>
                <Ionicons name="hardware-chip-outline" size={13} color={Colors.primary} />
                <Text style={styles.agentNoteText}>6 AI Agents: SAMAJH · CHUNNO · DHUNDHO · PAKKA · MOLTOL · HIFAZAT</Text>
              </View>
            )}
          </View>
        )}
      </Animated.View>

      {/* ── SIDEBAR OVERLAY ── */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents={sidebarOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={closeSidebar} activeOpacity={1} />
      </Animated.View>

      {/* ── SIDEBAR DRAWER ── */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX: drawerTranslateX }], paddingTop: insets.top }]}>
        {/* Close button */}
        <TouchableOpacity style={styles.sidebarCloseBtn} onPress={closeSidebar} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>

        {/* User profile section */}
        <View style={styles.sidebarProfile}>
          <View style={styles.sidebarAvatar}>
            <Text style={styles.sidebarAvatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sidebarName} numberOfLines={1}>{isMockMode ? 'Ahmed Ali' : displayName}</Text>
            <Text style={styles.sidebarEmail} numberOfLines={1}>{isMockMode ? 'ahmed.ali@gmail.com' : (user?.email || '')}</Text>
            <View style={styles.loyalBadge}>
              <Text style={styles.loyalBadgeText}>Loyal Customer ⭐</Text>
            </View>
          </View>
        </View>

        {/* Navigation items */}
        <ScrollView style={styles.sidebarScroll} showsVerticalScrollIndicator={false}>
          {SIDEBAR_NAV.map((item) => (
            <View key={item.label}>
              {item.dividerBefore && <View style={styles.sidebarDivider} />}
              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => handleSidebarNav(item.path)}
                activeOpacity={0.75}
              >
                <View style={[styles.sidebarItemIcon, item.highlight && styles.sidebarItemIconHighlight]}>
                  <Ionicons name={item.icon as any} size={18} color={item.highlight ? Colors.primary : Colors.textSecondary} />
                </View>
                <Text style={[styles.sidebarItemLabel, item.highlight && { color: Colors.primary, fontWeight: FontWeight.bold }]}>
                  {item.label}
                </Text>
                {item.badge && (
                  <View style={styles.sidebarBadge}>
                    <Text style={styles.sidebarBadgeText}>{item.badge}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={15} color={Colors.border} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Divider */}
          <View style={styles.sidebarDivider} />

          {/* Demo Mode toggle */}
          <View style={styles.sidebarToggleRow}>
            <View style={[styles.sidebarItemIcon]}>
              <Ionicons name="color-wand-outline" size={18} color={Colors.textSecondary} />
            </View>
            <Text style={styles.sidebarItemLabel}>{tr.demoMode}</Text>
            <Switch
              value={isMockMode}
              onValueChange={toggleMockMode}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={isMockMode ? Colors.textInverse : Colors.textMuted}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          {/* Divider */}
          <View style={styles.sidebarDivider} />

          {/* Logout */}
          <TouchableOpacity style={styles.sidebarLogout} onPress={handleLogout} activeOpacity={0.75}>
            <View style={[styles.sidebarItemIcon, { backgroundColor: Colors.dangerDim }]}>
              <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            </View>
            <Text style={[styles.sidebarItemLabel, { color: Colors.danger }]}>{tr.logout}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.sidebarFooter, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={styles.sidebarFooterText}>Haazir AI v1.0 · Google Hackathon</Text>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // ── Header
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  headerCenter: { flex: 1, paddingHorizontal: Spacing.xs },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  availText: { fontSize: 11, color: Colors.textMuted, fontWeight: FontWeight.medium },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.surface,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.sm, position: 'relative',
  },
  avatarBtn: { backgroundColor: Colors.primaryLight },
  avatarInitial: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  notifDot: {
    position: 'absolute', top: 7, right: 7,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: Colors.danger, borderWidth: 1.5, borderColor: Colors.surface,
  },
  apiBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dangerDim,
    borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 5,
    marginTop: 6, borderWidth: 1, borderColor: Colors.danger,
  },
  apiBannerText: { color: Colors.danger, fontSize: FontSize.xs, flex: 1 },

  // ── Map markers
  markerBubble: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    ...Shadow.card,
  },
  markerBubbleSelected: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 3, borderColor: Colors.textPrimary,
  },

  // ── Bottom sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    ...Shadow.modal,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border },

  // Provider detail
  providerContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.md },
  backText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  providerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  providerAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', ...Shadow.sm },
  providerInfo: { flex: 1 },
  providerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  providerName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  providerService: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: 6 },
  availBadge: { alignSelf: 'flex-start', backgroundColor: Colors.successDim, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  unavailBadge: { backgroundColor: Colors.dangerDim },
  availBadgeText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold },
  unavailBadgeText: { color: Colors.danger },

  statsRow: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 2 },
  statLbl: { fontSize: FontSize.xs, color: Colors.textMuted },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border },

  priceCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primaryLight, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  priceLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 2 },
  priceVal: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary },
  areaTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  areaTagText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },

  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  bookBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.lg, height: 50, ...Shadow.primary },
  bookBtnDisabled: { backgroundColor: Colors.textMuted },
  bookBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  aiBtn: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primaryLight, borderRadius: Radius.lg, height: 50, borderWidth: 1, borderColor: Colors.primaryDim },
  aiBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  // Services sheet
  sheetInner: { flex: 1, paddingHorizontal: Spacing.md, overflow: 'hidden' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sheetTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  tracesBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: Colors.primaryLight, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primaryDim },
  tracesBtnText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  chipsRow: { marginBottom: Spacing.md, marginLeft: -4 },
  chip: { alignItems: 'center', gap: 5, marginLeft: Spacing.sm, width: 68 },
  chipDanger: {},
  chipIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center', ...Shadow.sm },
  chipIconDanger: { backgroundColor: Colors.dangerDim },
  chipLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold, textAlign: 'center' },
  chipLabelDanger: { color: Colors.danger },

  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  micOuter: { width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.primaryDim, justifyContent: 'center', alignItems: 'center' },
  micOuterActive: { backgroundColor: 'rgba(255,59,48,0.12)' },
  micBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', ...Shadow.primary },
  micBtnActive: { backgroundColor: Colors.danger },
  talkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primaryLight, borderRadius: Radius.full, height: 48, borderWidth: 1, borderColor: Colors.primaryDim },
  talkBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.bold },

  recentBox: { marginTop: Spacing.md },
  recentHeading: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  recentText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },

  agentNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md, padding: Spacing.sm, backgroundColor: Colors.primaryLight, borderRadius: Radius.md },
  agentNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },

  // ── Sidebar overlay
  overlay: { backgroundColor: '#000' },

  // ── Sidebar drawer
  sidebar: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    width: SIDEBAR_W,
    backgroundColor: Colors.surface,
    ...Shadow.modal,
    borderTopRightRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
  },
  sidebarCloseBtn: {
    position: 'absolute', top: 52, right: 14,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1,
  },
  sidebarProfile: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.primaryLight,
    borderBottomWidth: 1, borderBottomColor: Colors.primaryDim,
  },
  sidebarAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.primary,
  },
  sidebarAvatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: '#fff' },
  sidebarName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 2 },
  sidebarEmail: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 5 },
  loyalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  loyalBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold },

  sidebarScroll: { flex: 1 },
  sidebarDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xs, marginHorizontal: Spacing.md },

  sidebarItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13,
    gap: Spacing.sm,
  },
  sidebarItemIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  sidebarItemIconHighlight: { backgroundColor: Colors.primaryLight },
  sidebarItemLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },

  sidebarBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 2,
    marginRight: 4,
  },
  sidebarBadgeText: { fontSize: 10, color: '#fff', fontWeight: FontWeight.bold },

  sidebarToggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    gap: Spacing.sm,
  },
  sidebarLogout: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13,
    gap: Spacing.sm,
  },

  sidebarFooter: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
  },
  sidebarFooterText: { fontSize: 11, color: Colors.textMuted },
});

export default CustomerHomeScreen;
