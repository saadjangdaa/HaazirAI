export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'Email format sahi nahi hai',
    'auth/user-disabled': 'Yeh account band hai',
    'auth/user-not-found': 'Account nahi mila — pehle sign up karein',
    'auth/wrong-password': 'Email ya password galat hai',
    'auth/invalid-credential': 'Email ya password galat hai',
    'auth/email-already-in-use': 'Yeh email pehle se registered hai',
    'auth/weak-password': 'Password kam az kam 6 characters hon',
    'auth/too-many-requests': 'Bahut zyada tries — thori der baad try karein',
    'auth/network-request-failed': 'Internet check karein',
  };
  if (code && map[code]) return map[code];
  if (err instanceof Error) return err.message;
  return 'Login fail — dobara try karein';
}
