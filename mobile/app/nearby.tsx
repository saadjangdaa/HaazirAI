import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, StatusBar, Alert, ActivityIndicator, Modal, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useMockData } from '../context/MockDataContext';
import { createJobRequest, formatApiError, requireUserId, getAllProviders, Provider } from '../services/api';
import { MOCK_NEARBY_WORKERS, NearbyWorker } from '../data/mockData';

// Map backend Provider → NearbyWorker shape used by WorkerCard
function toNearbyWorker(p: Provider): NearbyWorker {
  return {
    id: p.id,
    name: p.name,
    service: p.service || 'Service',
    rating: p.rating || 4.0,
    reviews: p.review_count || 0,
    priceMin: p.price_per_hour || 500,
    priceMax: (p.price_per_hour || 500) * 2,
    distanceKm: p.distance_km || 0,
    available: p.available !== false,
    verified: p.verified || false,
    completedJobs: p.jobs_completed || 0,
    area: p.area || '',
    lat: p.lat || 0,
    lng: p.lng || 0,
  };
}

const SERVICES = ['All', 'AC Repair', 'Plumber', 'Electrician', 'Tutor', 'Carpenter', 'Beautician'];
const SORTS = ['Distance', 'Rating', 'Price'] as const;
type SortKey = typeof SORTS[number];

const SERVICE_ICONS: Record<string, any> = {
  'All': 'apps-outline',
  'AC Repair': 'snow-outline',
  'Plumber': 'water-outline',
  'Electrician': 'flash-outline',
  'Tutor': 'book-outline',
  'Carpenter': 'hammer-outline',
  'Beautician': 'sparkles-outline',
};

function WorkerCard({ worker, onBook }: { worker: NearbyWorker; onBook: (w: NearbyWorker) => void }) {
  const initial = worker.name.charAt(0);
  const stars = Math.round(worker.rating);

  return (
    <View style={[styles.card, Shadow.card]}>
      <View style={styles.cardTop}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.workerName}>{worker.name}</Text>
            {worker.verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={11} color={Colors.primary} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
          </View>
          <Text style={styles.serviceLabel}>{worker.service}</Text>
          <Text style={styles.areaText}>
            <Ionicons name="location-outline" size={11} color={Colors.textMuted} /> {worker.area}
          </Text>
        </View>

        {/* Distance */}
        <View style={styles.distanceBadge}>
          <Ionicons name="navigate-outline" size={11} color={Colors.primary} />
          <Text style={styles.distanceText}>{worker.distanceKm} km</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{'⭐'.repeat(stars).slice(0, 5)} {worker.rating}</Text>
          <Text style={styles.statLabel}>{worker.reviews} reviews</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>Rs {worker.priceMin}–{worker.priceMax}</Text>
          <Text style={styles.statLabel}>Price range</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{worker.completedJobs}</Text>
          <Text style={styles.statLabel}>Jobs done</Text>
        </View>
      </View>

      {/* Availability + Book */}
      <View style={styles.cardBottom}>
        <View style={[styles.availBadge, worker.available ? styles.availOnline : styles.availOffline]}>
          <View style={[styles.availDot, { backgroundColor: worker.available ? Colors.success : Colors.textMuted }]} />
          <Text style={[styles.availText, { color: worker.available ? Colors.success : Colors.textMuted }]}>
            {worker.available ? 'Available Now' : 'Unavailable'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.bookBtn, !worker.available && styles.bookBtnDisabled]}
          onPress={() => onBook(worker)}
          disabled={!worker.available}
          activeOpacity={0.85}
        >
          <Text style={styles.bookBtnText}>Book</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.textInverse} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function NearbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isMockMode } = useMockData();

  const [search, setSearch] = useState('');
  const [selectedService, setSelectedService] = useState('All');
  const [sortBy, setSortBy] = useState<SortKey>('Distance');
  const [availableOnly, setAvailableOnly] = useState(false);

  // Real providers from backend
  const [realWorkers, setRealWorkers] = useState<NearbyWorker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadRealWorkers = async (isRefresh = false) => {
    if (isMockMode) return;
    isRefresh ? setRefreshing(true) : setLoadingWorkers(true);
    try {
      const providers = await getAllProviders(city);
      setRealWorkers(providers.map(toNearbyWorker));
    } catch {
      // Fallback to mock on error
      setRealWorkers(MOCK_NEARBY_WORKERS);
    } finally {
      setLoadingWorkers(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isMockMode) loadRealWorkers();
  }, [city, isMockMode]);

  // Source: real providers or mock
  const allWorkers = isMockMode ? MOCK_NEARBY_WORKERS : realWorkers;

  // Job request modal state
  const [modalWorker, setModalWorker] = useState<NearbyWorker | null>(null);
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'medium' | 'high'>('medium');
  const [submitting, setSubmitting] = useState(false);

  const city = user?.city || 'Karachi';

  const filtered = useMemo(() => {
    let list = [...allWorkers];
    if (selectedService !== 'All') {
      list = list.filter((w) =>
        w.service.toLowerCase().includes(selectedService.toLowerCase()) ||
        selectedService.toLowerCase().includes(w.service.toLowerCase())
      );
    }
    if (availableOnly) list = list.filter((w) => w.available);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(q) || w.service.toLowerCase().includes(q) || w.area.toLowerCase().includes(q));
    }
    if (sortBy === 'Rating') list.sort((a, b) => b.rating - a.rating);
    else if (sortBy === 'Price') list.sort((a, b) => a.priceMin - b.priceMin);
    else list.sort((a, b) => a.distanceKm - b.distanceKm);
    return list;
  }, [allWorkers, selectedService, sortBy, availableOnly, search]);

  const handleBook = (worker: NearbyWorker) => {
    if (isMockMode) {
      // Mock mode: go directly to booking screen with provider data
      router.push({
        pathname: '/booking',
        params: {
          providerData: JSON.stringify({
            id: worker.id,
            name: worker.name,
            service: worker.service,
            area: worker.area,
            city,
            rating: worker.rating,
            distance_km: worker.distanceKm,
            verified: worker.verified,
            price_per_hour: worker.priceMin,
          }),
          priceData: JSON.stringify({ total: worker.priceMin, estimated_base: worker.priceMin }),
        },
      });
      return;
    }
    // Real mode: open job details modal
    setModalWorker(worker);
    setDescription('');
    setUrgency('medium');
  };

  const handleSendJobRequest = async () => {
    if (!modalWorker || !user?.id) return;
    setSubmitting(true);
    try {
      const uid = requireUserId(user);
      const job = await createJobRequest({
        user_id: uid,
        service: modalWorker.service,
        location: modalWorker.area,
        city,
        urgency,
        description,
        estimated_price: modalWorker.priceMin,
        // Pass this worker as the only provider so only they get notified
        providers: [{
          id: modalWorker.id,
          name: modalWorker.name,
          service: modalWorker.service,
          area: modalWorker.area,
          city,
          rating: modalWorker.rating,
        }],
      });
      setModalWorker(null);
      Alert.alert(
        '✅ Job Request Bhej Di!',
        `${modalWorker.name} ko notify kar diya gaya.\nWoh accept karein ge toh aapko push notification aayega.`,
        [{
          text: 'Bids Dekhein',
          onPress: () => router.push({
            pathname: '/results',
            params: {
              data: JSON.stringify({
                request_id: job.job_request_id,
                extracted_intent: { service_type: modalWorker.service, location: modalWorker.area, city, urgency },
                providers_ranked: [],
                agent_logs: [],
              }),
              jobRequestId: job.job_request_id,
            },
          }),
        }],
      );
    } catch (e) {
      Alert.alert('Error', formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Nearby Workers</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={12} color="rgba(255,255,255,0.75)" />
            <Text style={styles.locationText}>{city}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.availToggle, availableOnly && styles.availToggleActive]}
          onPress={() => setAvailableOnly(!availableOnly)}
        >
          <Ionicons name="radio-outline" size={14} color={availableOnly ? Colors.primary : 'rgba(255,255,255,0.75)'} />
          <Text style={[styles.availToggleText, availableOnly && { color: Colors.primary }]}>Available</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Worker ya service dhundho..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Service filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {SERVICES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, selectedService === s && styles.filterChipActive]}
            onPress={() => setSelectedService(s)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={SERVICE_ICONS[s]}
              size={13}
              color={selectedService === s ? Colors.textInverse : Colors.textSecondary}
            />
            <Text style={[styles.filterChipText, selectedService === s && styles.filterChipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sort row */}
      <View style={styles.sortRow}>
        <Text style={styles.countText}>
          {loadingWorkers ? 'Load ho raha hai...' : `${filtered.length} workers mila — ${city}`}
        </Text>
        <View style={styles.sortBtns}>
          {SORTS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sortBtn, sortBy === s && styles.sortBtnActive]}
              onPress={() => setSortBy(s)}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortBtnText, sortBy === s && styles.sortBtnTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Workers list */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadRealWorkers(true)}
            tintColor={Colors.primary}
          />
        }
      >
        {loadingWorkers ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.emptyText}>{city} ke workers load ho rahe hain...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Koi worker nahi mila</Text>
            <Text style={styles.emptyText}>{city} mein koi worker nahi — filter change karein</Text>
          </View>
        ) : (
          filtered.map((w) => <WorkerCard key={w.id} worker={w} onBook={handleBook} />)
        )}
      </ScrollView>

      {/* Job Request Modal */}
      <Modal visible={!!modalWorker} transparent animationType="slide" onRequestClose={() => setModalWorker(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            {/* Handle */}
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>
              {modalWorker?.name} ko Job Request Bhejein
            </Text>
            <Text style={styles.modalSub}>
              {modalWorker?.service} · {modalWorker?.area}, {city}
            </Text>
            <Text style={styles.modalPrice}>
              Rs {modalWorker?.priceMin.toLocaleString()} – {modalWorker?.priceMax.toLocaleString()}
            </Text>

            {/* Description */}
            <Text style={styles.inputLabel}>Kaam ka description (optional)</Text>
            <TextInput
              style={styles.descInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Maslan: 1.5 ton AC ki gas khatam ho gayi hai..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            {/* Urgency */}
            <Text style={styles.inputLabel}>Urgency</Text>
            <View style={styles.urgencyRow}>
              <TouchableOpacity
                style={[styles.urgencyBtn, urgency === 'medium' && styles.urgencyBtnActive]}
                onPress={() => setUrgency('medium')}
              >
                <Ionicons name="time-outline" size={16} color={urgency === 'medium' ? Colors.primary : Colors.textMuted} />
                <Text style={[styles.urgencyText, urgency === 'medium' && styles.urgencyTextActive]}>Normal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.urgencyBtn, urgency === 'high' && styles.urgencyBtnUrgent]}
                onPress={() => setUrgency('high')}
              >
                <Ionicons name="flash" size={16} color={urgency === 'high' ? Colors.danger : Colors.textMuted} />
                <Text style={[styles.urgencyText, urgency === 'high' && styles.urgencyTextUrgent]}>Jaldi chahiye</Text>
              </TouchableOpacity>
            </View>

            {/* Buttons */}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalWorker(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSendJobRequest}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="send-outline" size={16} color="#fff" />
                      <Text style={styles.sendText}>Request Bhejein</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  locationText: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)' },
  availToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  availToggleActive: { backgroundColor: Colors.textInverse },
  availToggleText: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', fontWeight: FontWeight.semibold },

  searchWrap: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },

  filterScroll: { backgroundColor: Colors.surface, maxHeight: 52 },
  filterContent: { paddingHorizontal: Spacing.md, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.textInverse },

  sortRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  countText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  sortBtns: { flexDirection: 'row', gap: 6 },
  sortBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  sortBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  sortBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold },
  sortBtnTextActive: { color: Colors.primary },

  list: { flex: 1 },
  listContent: { padding: Spacing.md, gap: Spacing.sm },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  workerName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold },
  serviceLabel: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, marginTop: 1 },
  areaText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  distanceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  distanceText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  statDivider: { width: 1, height: 24, backgroundColor: Colors.border },

  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  availBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full,
  },
  availOnline: { backgroundColor: Colors.successDim },
  availOffline: { backgroundColor: Colors.inputBg },
  availDot: { width: 7, height: 7, borderRadius: 4 },
  availText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  bookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 9,
  },
  bookBtnDisabled: { backgroundColor: Colors.border },
  bookBtnText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  // Job request modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 4,
  },
  modalSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: 2 },
  modalPrice: {
    fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.success, marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: Spacing.sm,
  },
  descInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 10, minHeight: 72,
    fontSize: FontSize.sm, color: Colors.textPrimary, backgroundColor: Colors.background,
    textAlignVertical: 'top',
  },
  urgencyRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  urgencyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingVertical: 10,
  },
  urgencyBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  urgencyBtnUrgent: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  urgencyText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  urgencyTextActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
  urgencyTextUrgent: { color: Colors.danger, fontWeight: FontWeight.semibold },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center',
  },
  cancelText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  sendBtn: {
    flex: 2, backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 13, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  sendText: { fontSize: FontSize.sm, color: '#fff', fontWeight: FontWeight.semibold },
});
