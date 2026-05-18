export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'Email format sahi nahi hai — example: name@gmail.com',
    'auth/user-disabled': 'Yeh account band kar diya gaya hai',
    'auth/user-not-found': 'Yeh email registered nahi — pehle sign up karein',
    'auth/wrong-password': 'Password galat hai — dobara check karein',
    'auth/invalid-credential': 'Email ya password galat hai',
    'auth/email-already-in-use': 'Yeh email pehle se registered hai — login karein ya doosra email use karein',
    'auth/weak-password': 'Password kam az kam 6 characters ka hona chahiye',
    'auth/too-many-requests': 'Bahut zyada tries — kuch der baad try karein',
    'auth/network-request-failed': 'Internet connection check karein',
    'auth/operation-not-allowed': 'Email/Password login Firebase Console mein enable nahi — admin se rabta karein',
    'auth/missing-password': 'Password daalna zaroori hai',
    'auth/missing-email': 'Email daalna zaroori hai',
    'auth/popup-closed-by-user': 'Login window band ho gaya — dobara try karein',
    'auth/account-exists-with-different-credential': 'Yeh email doosre login method se registered hai',
  };
  if (code && map[code]) return map[code];
  if (err instanceof Error) return err.message;
  return 'Kuch masla hua — dobara try karein';
}
