/** Client-side profile normalization — mirrors backend user_validation rules. */

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/;

export function normalizeUsername(raw: string): string {
  const u = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) {
    throw new Error(
      'Username 3–30 characters hona chahiye (letter se start, letters/numbers/underscore)'
    );
  }
  return u;
}

export function normalizePkPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('92') && digits.length >= 12) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.length === 10 && digits.startsWith('3')) {
    digits = `0${digits}`;
  }

  if (!/^03\d{9}$/.test(digits)) {
    throw new Error('Mobile Pakistan format: 03XXXXXXXXX (11 digits)');
  }
  return digits;
}

export function normalizeCnic(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 13) {
    throw new Error('CNIC 13 digits ka hona chahiye (12345-1234567-1)');
  }
  return digits;
}

export function formatCnicDisplay(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export type UserRole = 'customer' | 'worker';

type ProfileLike = {
  username?: string;
  name?: string;
  email?: string;
  phone?: string;
  cnic?: string;
  role?: UserRole;
  profile_complete?: boolean;
} | null | undefined;

/** Mirrors backend profile_completion_issues — customers need name + email only. */
export function isProfileComplete(
  profile: ProfileLike,
  role: UserRole = profile?.role === 'worker' ? 'worker' : 'customer'
): boolean {
  if (!profile) return false;
  if (profile.profile_complete === true) return true;

  const username = (profile.username || profile.name || '').trim();

  if (role === 'customer') {
    const email = (profile.email || '').trim();
    return username.length > 0 && email.length > 0;
  }

  const phone = profile.phone || '';
  const cnic = profile.cnic || '';
  if (!username || !phone || !cnic) return false;

  try {
    normalizeUsername(username);
    normalizePkPhone(phone);
    normalizeCnic(cnic);
    return true;
  } catch {
    return false;
  }
}
