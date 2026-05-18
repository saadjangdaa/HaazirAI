import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';

export function requireCurrentUser(): User {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Login zaroori hai — Firebase account se sign in karein');
  }
  return user;
}

/** Wait until Firebase Auth has a user (e.g. right after createUser). */
export function waitForAuthUser(expectedUid?: string, timeoutMs = 10000): Promise<User> {
  const current = auth.currentUser;
  if (current && (!expectedUid || current.uid === expectedUid)) {
    return Promise.resolve(current);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub();
      reject(new Error('Auth session ready nahi hua — dobara try karein'));
    }, timeoutMs);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && (!expectedUid || user.uid === expectedUid)) {
        clearTimeout(timeout);
        unsub();
        resolve(user);
      }
    });
  });
}
