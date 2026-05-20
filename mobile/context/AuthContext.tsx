import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import {
  formatApiError,
  getUserProfile,
  syncUserProfile,
  UserProfile,
} from '../services/api';
import { registerForPushNotifications } from '../services/pushNotifications';
import { isProfileComplete } from '../utils/profileValidation';
import { requireCurrentUser, waitForAuthUser } from '../services/authSession';

export type UserRole = 'customer' | 'worker';

/** Worker-specific fields on unified users/{uid} document. */
export interface WorkerData {
  specializations: string[];
  areas: string[];
  pricePerService: number;
  experienceYears: number;
  cnic: string;
  phone: string;
  availability?: boolean;
  rating?: number;
  providerId?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  phone: string;
  cnic: string;
  city: string;
  role: UserRole;
  profileComplete: boolean;
  workerOnboarded: boolean;
  workerData?: WorkerData;
}

export interface ProfileFields {
  username: string;
  phone: string;
  cnic: string;
  city?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** True after explicit sign-in/sign-up this app session (cleared on sign-out). */
  hasSessionThisLaunch: boolean;
  /** Customer must pick language once per login; cleared by completeLanguageSelect(). */
  needsLanguagePicker: boolean;
  completeLanguageSelect: () => void;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (email: string, password: string, name: string, role: UserRole, cnic?: string, city?: string) => Promise<AuthUser>;
  completeWorkerSignup: (data: WorkerData) => Promise<AuthUser>;
  /** Await POST /api/users/sync before booking/request flows — returns fresh server profile. */
  ensureProfileSyncedBeforeRequest: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

async function writeUserToFirestore(
  uid: string,
  data: { email: string; username: string; name: string; role: UserRole; displayName?: string; cnic?: string; city?: string }
): Promise<void> {
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    await setDoc(
      ref,
      {
        ...existing,
        user_id: uid,
        uid,
        email: data.email,
        username: data.username,
        name: data.name,
        display_name: data.displayName || data.name,
        role: data.role,
        profile_complete: true,
        last_login: serverTimestamp(),
        ...(data.cnic ? { cnic: data.cnic } : {}),
        ...(data.city ? { city: data.city } : {}),
        ...(snap.exists() ? {} : { created_at: serverTimestamp(), booking_history: [] }),
      },
      { merge: true }
    );
  } catch (e) {
    if (__DEV__) console.warn('[Auth] Firestore write failed:', e);
  }
}

function parseWorkerData(profile: UserProfile | null): WorkerData | undefined {
  if (!profile || profile.role !== 'worker') return undefined;

  const legacy = profile.worker_data as WorkerData | undefined;
  const skills = profile.skills ?? legacy?.specializations;
  const areas = profile.areas ?? legacy?.areas;

  if (!skills?.length && !legacy?.specializations?.length) return undefined;

  return {
    specializations: skills ?? legacy?.specializations ?? [],
    areas: areas ?? legacy?.areas ?? [],
    pricePerService: profile.price_per_service ?? legacy?.pricePerService ?? 500,
    experienceYears: profile.experience_years ?? legacy?.experienceYears ?? 1,
    cnic: profile.cnic ?? legacy?.cnic ?? '',
    phone: profile.phone ?? legacy?.phone ?? '',
    availability: profile.availability ?? legacy?.availability ?? true,
    rating: profile.rating ?? legacy?.rating ?? 0,
    providerId: profile.provider_id ?? legacy?.providerId,
  };
}

function isWorkerOnboarded(profile: UserProfile | null, role: UserRole): boolean {
  if (role !== 'worker') return true;
  const skills = profile?.skills ?? (profile?.worker_data as WorkerData)?.specializations;
  return Array.isArray(skills) && skills.length > 0;
}

function nameToUsername(name: string, uid: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (slug.length >= 3 && /^[a-z]/.test(slug)) return slug.slice(0, 30);
  return `u_${uid.slice(0, 8).toLowerCase()}`;
}

/** Backfill display name for legacy accounts (Firebase-only signup, partial server sync). */
function deriveProfileUsername(fbUser: User, profile?: UserProfile | null): string {
  // Prefer already-slugified username/name fields; display_name may contain spaces/caps
  const fromProfile = (profile?.username || profile?.name || '').trim();
  if (fromProfile) return fromProfile;
  // Fall back to display_name or Firebase displayName, but always slugify first
  const display = (profile?.display_name || fbUser.displayName || '').trim();
  if (display) return nameToUsername(display, fbUser.uid);
  const email = (fbUser.email || profile?.email || '').trim();
  if (email.includes('@')) {
    return nameToUsername(email.split('@')[0], fbUser.uid);
  }
  return nameToUsername('', fbUser.uid);
}

function mapProfileToAuthUser(fbUser: User, profile: UserProfile | null, roleHint?: UserRole): AuthUser {
  const role: UserRole =
    profile?.role === 'worker' || profile?.role === 'customer'
      ? profile.role
      : roleHint ?? 'customer';

  const username = deriveProfileUsername(fbUser, profile);
  const phone = profile?.phone || '';
  const cnic = profile?.cnic || '';
  const city = profile?.city || '';
  const profileForCheck = {
    ...(profile || {}),
    username,
    name: profile?.name || username,
    email: profile?.email || fbUser.email || '',
    role,
  };
  const profileComplete =
    profile?.profile_complete === true ||
    isProfileComplete(profileForCheck, role);
  const workerData = parseWorkerData(profile);

  return {
    id: fbUser.uid,
    email: fbUser.email || profile?.email || '',
    username,
    phone,
    cnic,
    city,
    role,
    profileComplete,
    workerOnboarded: isWorkerOnboarded(profile, role),
    workerData,
  };
}

async function fetchServerProfile(
  uid: string,
  timeoutMs?: number
): Promise<UserProfile | null> {
  return getUserProfile(uid, timeoutMs);
}

async function syncToBackend(
  fbUser: User,
  role: UserRole,
  fields?: Partial<ProfileFields>,
  workerData?: WorkerData,
  cachedProfile?: UserProfile | null
): Promise<UserProfile> {
  const existing =
    cachedProfile !== undefined ? cachedProfile : await fetchServerProfile(fbUser.uid);
  const pushToken = await registerForPushNotifications();
  const body: Parameters<typeof syncUserProfile>[0] = {
    user_id: fbUser.uid,
    email: (fbUser.email || existing?.email || '').trim(),
    role,
    username: (fields?.username || deriveProfileUsername(fbUser, existing)).trim(),
    push_token: pushToken || undefined,
    provider_id: workerData?.providerId,
  };
  if (fields?.phone) {
    body.phone = fields.phone;
  }
  if (fields?.cnic) {
    body.cnic = fields.cnic;
  }
  if (fields?.city) {
    body.city = fields.city;
  }

  if (workerData) {
    if (workerData.phone && !body.phone) body.phone = workerData.phone;
    if (workerData.cnic && !body.cnic) body.cnic = workerData.cnic;
    if (fields?.username && !body.username) body.username = fields.username;

    body.worker_data = {
      specializations: workerData.specializations,
      areas: workerData.areas,
      pricePerService: workerData.pricePerService,
      experienceYears: workerData.experienceYears,
      availability: workerData.availability ?? true,
      rating: workerData.rating ?? 0,
      ...(workerData.providerId ? { providerId: workerData.providerId } : {}),
    };
    body.skills = workerData.specializations;
    body.areas = workerData.areas;
    body.availability = workerData.availability ?? true;
    body.rating = workerData.rating ?? 0;
    body.price_per_service = workerData.pricePerService;
    body.experience_years = workerData.experienceYears;
  }

  await syncUserProfile(body);

  const profile = await fetchServerProfile(fbUser.uid);
  if (!profile) {
    throw new Error('Profile sync failed — users/{uid} document not created on server');
  }
  return profile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSessionThisLaunch, setHasSessionThisLaunch] = useState(false);
  const [needsLanguagePicker, setNeedsLanguagePicker] = useState(false);
  const authOpRef = useRef(false);
  const mountedRef = useRef(true);
  // Incremented on every signOut — stale bootstrap calls check this and bail if it changed.
  const sessionTokenRef = useRef(0);

  const bootstrapFromFirebase = useCallback(
    async (fbUser: User, options: { sync: boolean; roleHint?: UserRole }) => {
      // Snapshot session token — if user signs out while this is running, token changes and we bail.
      const myToken = sessionTokenRef.current;

      // Use a short timeout so a slow/down backend doesn't block the splash screen.
      let profile = await fetchServerProfile(fbUser.uid, 4000);

      if (sessionTokenRef.current !== myToken) return mapProfileToAuthUser(fbUser, null);

      // Fallback: backend in MOCK_MODE may have lost the doc (Render restart) — read from real Firestore.
      if (!profile) {
        const snap = await getDoc(doc(db, 'users', fbUser.uid)).catch(() => null);
        if (snap?.exists()) profile = snap.data() as UserProfile;
      }

      if (options.sync) {
        try {
          profile = await syncToBackend(
            fbUser,
            profile?.role === 'worker' || profile?.role === 'customer'
              ? profile.role
              : options.roleHint ?? 'customer',
            profile
              ? {
                  ...(profile.phone ? { phone: profile.phone } : {}),
                  ...(profile.cnic ? { cnic: profile.cnic } : {}),
                }
              : undefined,
            parseWorkerData(profile),
            profile
          );
        } catch (syncErr) {
          if (__DEV__) console.warn('[Auth] Bootstrap sync failed (using cached profile):', syncErr);
        }
      }

      if (sessionTokenRef.current !== myToken) return mapProfileToAuthUser(fbUser, null);

      const mapped = mapProfileToAuthUser(
        fbUser,
        profile,
        options.roleHint ?? (profile?.role as UserRole | undefined)
      );

      if (mountedRef.current) setUser(mapped);
      return mapped;
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (authOpRef.current) return;

      try {
        if (fbUser) {
          await bootstrapFromFirebase(fbUser, { sync: true });
        } else if (mountedRef.current) {
          setUser(null);
          setHasSessionThisLaunch(false);
          setNeedsLanguagePicker(false);
        }
      } catch (err) {
        console.error('[Auth] bootstrap failed:', err);
        if (mountedRef.current && fbUser) {
          setUser(
            mapProfileToAuthUser(fbUser, await fetchServerProfile(fbUser.uid).catch(() => null))
          );
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [bootstrapFromFirebase]);

  const runAuthOperation = async <T,>(fn: () => Promise<T>): Promise<T> => {
    authOpRef.current = true;
    try {
      return await fn();
    } finally {
      authOpRef.current = false;
    }
  };

  const signIn = async (email: string, password: string): Promise<AuthUser> => {
    return runAuthOperation(async () => {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const fbUser = await waitForAuthUser(cred.user.uid);
      const mapped = await bootstrapFromFirebase(fbUser, { sync: true });
      if (mountedRef.current) {
        setHasSessionThisLaunch(true);
        setNeedsLanguagePicker(mapped.role === 'customer');
      }
      return mapped;
    });
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    role: UserRole,
    cnic?: string,
    city?: string
  ): Promise<AuthUser> => {
    return runAuthOperation(async () => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const fbUser = await waitForAuthUser(cred.user.uid);
      const username = nameToUsername(name, fbUser.uid);

      // Write to real Firestore immediately — backend may be in MOCK_MODE (Render w/o FIREBASE_PROJECT_ID).
      await writeUserToFirestore(fbUser.uid, {
        email: fbUser.email || email.trim(),
        username,
        name: username,
        displayName: name.trim(),
        role,
        cnic: cnic?.trim() || undefined,
        city: city?.trim() || undefined,
      });

      let profile: UserProfile | null = null;
      try {
        profile = await syncToBackend(fbUser, role, {
          username,
          ...(cnic?.trim() ? { cnic: cnic.trim() } : {}),
          ...(city?.trim() ? { city: city.trim() } : {}),
        });
      } catch (syncErr) {
        if (__DEV__) console.warn('[Auth] Signup backend sync failed, proceeding with Firebase data:', syncErr);
      }

      const mapped = mapProfileToAuthUser(
        fbUser,
        profile ?? { user_id: fbUser.uid, username, display_name: name.trim(), email: fbUser.email || email.trim(), role, cnic: cnic?.trim() || '', city: city?.trim() || '' },
        role
      );
      if (mountedRef.current) {
        setUser(mapped);
        setHasSessionThisLaunch(true);
        setNeedsLanguagePicker(role === 'customer');
      }
      return mapped;
    });
  };

  const completeLanguageSelect = useCallback(() => {
    setNeedsLanguagePicker(false);
  }, []);

  const completeWorkerSignup = async (data: WorkerData): Promise<AuthUser> => {
    return runAuthOperation(async () => {
      const fbUser = requireCurrentUser();
      // Always slugify username — user.username may be a raw display name with spaces/caps
      const rawName = user?.username || fbUser.displayName || fbUser.email?.split('@')[0] || '';
      const fields: ProfileFields = {
        username: nameToUsername(rawName, fbUser.uid),
        phone: data.phone || user?.phone || '',
        cnic: data.cnic || user?.cnic || '',
      };
      const profile = await syncToBackend(fbUser, 'worker', fields, {
        ...data,
        availability: data.availability ?? true,
        rating: data.rating ?? 0,
      });
      // Persist worker profile to real Firestore (backend may be in MOCK_MODE).
      await writeUserToFirestore(fbUser.uid, {
        email: fbUser.email || '',
        username: fields.username || user?.username || '',
        name: fields.username || user?.username || '',
        displayName: user?.username || fields.username || '',
        role: 'worker',
      });
      const mapped = mapProfileToAuthUser(fbUser, profile);
      setUser(mapped);
      if (mountedRef.current) {
        setHasSessionThisLaunch(true);
        setNeedsLanguagePicker(false);
      }
      return mapped;
    });
  };

  const ensureProfileSyncedBeforeRequest = useCallback(async (): Promise<AuthUser> => {
    const fbUser = requireCurrentUser();
    const current = user;
    const serverProfile = await fetchServerProfile(fbUser.uid);

    const fields: Partial<ProfileFields> = {
      username: deriveProfileUsername(fbUser, serverProfile ?? {
        username: current?.username,
        name: current?.username,
        email: current?.email,
      } as UserProfile),
    };
    const phone = current?.phone || serverProfile?.phone || '';
    const cnic = current?.cnic || serverProfile?.cnic || '';
    if (phone) fields.phone = phone;
    if (cnic) fields.cnic = cnic;

    const profile = await syncToBackend(
      fbUser,
      (current?.role ||
        (serverProfile?.role === 'worker' || serverProfile?.role === 'customer'
          ? serverProfile.role
          : 'customer')) as UserRole,
      fields,
      current?.workerData ?? parseWorkerData(serverProfile),
      serverProfile
    );
    const mapped = mapProfileToAuthUser(fbUser, profile, current?.role);
    if (mountedRef.current) setUser(mapped);
    return mapped;
  }, [user]);

  const signOut = async (): Promise<void> => {
    // Invalidate any in-flight bootstrap calls before signing out.
    sessionTokenRef.current += 1;
    return runAuthOperation(async () => {
      await firebaseSignOut(auth);
      if (mountedRef.current) {
        setUser(null);
        setHasSessionThisLaunch(false);
        setNeedsLanguagePicker(false);
      }
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        hasSessionThisLaunch,
        needsLanguagePicker,
        completeLanguageSelect,
        signIn,
        signUp,
        completeWorkerSignup,
        ensureProfileSyncedBeforeRequest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/** Map API/network errors during auth bootstrap. */
export function formatAuthBootstrapError(err: unknown): string {
  if (err instanceof Error && err.message.includes('Profile sync failed')) {
    return `${err.message}\n\nBackend check karein (port 8080) aur Wi‑Fi same ho.`;
  }
  return formatApiError(err);
}
