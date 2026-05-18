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
import { auth } from '../services/firebase';
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
  role: UserRole;
  profileComplete: boolean;
  workerOnboarded: boolean;
  workerData?: WorkerData;
}

export interface ProfileFields {
  username: string;
  phone: string;
  cnic: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** True only after explicit sign-in/sign-up this session — blocks cold-start auto-routing. */
  allowPostAuthRedirect: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (email: string, password: string, name: string, role: UserRole) => Promise<AuthUser>;
  completeWorkerSignup: (data: WorkerData) => Promise<AuthUser>;
  /** Await POST /api/users/sync before booking/request flows — returns fresh server profile. */
  ensureProfileSyncedBeforeRequest: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

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

function mapProfileToAuthUser(fbUser: User, profile: UserProfile | null, roleHint?: UserRole): AuthUser {
  const role: UserRole =
    profile?.role === 'worker' || profile?.role === 'customer'
      ? profile.role
      : roleHint ?? 'customer';

  const username = profile?.username || profile?.name || '';
  const phone = profile?.phone || '';
  const cnic = profile?.cnic || '';
  const profileComplete =
    profile?.profile_complete === true ||
    (profile ? isProfileComplete(profile) : false);
  const workerData = parseWorkerData(profile);

  return {
    id: fbUser.uid,
    email: fbUser.email || profile?.email || '',
    username,
    phone,
    cnic,
    role,
    profileComplete,
    workerOnboarded: isWorkerOnboarded(profile, role),
    workerData,
  };
}

async function fetchServerProfile(uid: string): Promise<UserProfile | null> {
  return getUserProfile(uid);
}

async function syncToBackend(
  fbUser: User,
  role: UserRole,
  fields?: Partial<ProfileFields>,
  workerData?: WorkerData
): Promise<UserProfile> {
  const pushToken = await registerForPushNotifications();
  const body: Parameters<typeof syncUserProfile>[0] = {
    user_id: fbUser.uid,
    email: fbUser.email || '',
    role,
    push_token: pushToken || undefined,
    provider_id: workerData?.providerId,
  };

  if (fields?.username) {
    body.username = fields.username;
  }
  if (fields?.phone) {
    body.phone = fields.phone;
  }
  if (fields?.cnic) {
    body.cnic = fields.cnic;
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
  const [allowPostAuthRedirect, setAllowPostAuthRedirect] = useState(false);
  const authOpRef = useRef(false);
  const mountedRef = useRef(true);

  const bootstrapFromFirebase = useCallback(
    async (fbUser: User, options: { sync: boolean; roleHint?: UserRole }) => {
      let profile = await fetchServerProfile(fbUser.uid);

      if (options.sync) {
        profile = await syncToBackend(
          fbUser,
          profile?.role === 'worker' || profile?.role === 'customer'
            ? profile.role
            : options.roleHint ?? 'customer',
          profile
            ? {
                ...(profile.username || profile.name
                  ? { username: (profile.username || profile.name) as string }
                  : {}),
                ...(profile.phone ? { phone: profile.phone } : {}),
                ...(profile.cnic ? { cnic: profile.cnic } : {}),
              }
            : undefined,
          parseWorkerData(profile)
        );
      }

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
          setAllowPostAuthRedirect(false);
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
      if (mountedRef.current) setAllowPostAuthRedirect(true);
      return mapped;
    });
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    role: UserRole
  ): Promise<AuthUser> => {
    return runAuthOperation(async () => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const fbUser = await waitForAuthUser(cred.user.uid);
      const username = nameToUsername(name, fbUser.uid);

      let profile: UserProfile | null = null;
      try {
        profile = await syncToBackend(fbUser, role, { username });
      } catch (syncErr) {
        if (__DEV__) console.warn('[Auth] Signup backend sync failed, proceeding with Firebase data:', syncErr);
      }

      const mapped = mapProfileToAuthUser(fbUser, profile, role);
      if (mountedRef.current) {
        setUser(mapped);
        setAllowPostAuthRedirect(true);
      }
      return mapped;
    });
  };

  const completeWorkerSignup = async (data: WorkerData): Promise<AuthUser> => {
    return runAuthOperation(async () => {
      const fbUser = requireCurrentUser();
      const fields: ProfileFields = {
        username: user?.username || '',
        phone: data.phone || user?.phone || '',
        cnic: data.cnic || user?.cnic || '',
      };
      const profile = await syncToBackend(fbUser, 'worker', fields, {
        ...data,
        availability: data.availability ?? true,
        rating: data.rating ?? 0,
      });
      const mapped = mapProfileToAuthUser(fbUser, profile);
      setUser(mapped);
      setAllowPostAuthRedirect(true);
      return mapped;
    });
  };

  const ensureProfileSyncedBeforeRequest = useCallback(async (): Promise<AuthUser> => {
    const fbUser = requireCurrentUser();
    const current = user;
    const serverProfile = await fetchServerProfile(fbUser.uid);

    const fields: Partial<ProfileFields> = {};
    const username =
      current?.username || serverProfile?.username || serverProfile?.name || '';
    const phone = current?.phone || serverProfile?.phone || '';
    const cnic = current?.cnic || serverProfile?.cnic || '';
    if (username) fields.username = username;
    if (phone) fields.phone = phone;
    if (cnic) fields.cnic = cnic;

    const profile = await syncToBackend(
      fbUser,
      (current?.role ||
        (serverProfile?.role === 'worker' || serverProfile?.role === 'customer'
          ? serverProfile.role
          : 'customer')) as UserRole,
      Object.keys(fields).length ? fields : undefined,
      current?.workerData ?? parseWorkerData(serverProfile)
    );
    const mapped = mapProfileToAuthUser(fbUser, profile, current?.role);
    if (mountedRef.current) setUser(mapped);
    return mapped;
  }, [user]);

  const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth);
    setUser(null);
    setAllowPostAuthRedirect(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        allowPostAuthRedirect,
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
