import React, { createContext, useContext, useState } from 'react';

export type UserRole = 'customer' | 'worker';

export interface WorkerData {
  specializations: string[];
  areas: string[];
  pricePerService: number;
  experienceYears: number;
  cnic: string;
  phone: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  workerData?: WorkerData;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string, role?: UserRole) => Promise<void>;
  signUp: (email: string, password: string, name: string, role: UserRole) => Promise<void>;
  completeWorkerSignup: (data: WorkerData) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Demo auth — to wire Firebase, replace signIn/signUp with:
//   import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
//   import { auth } from '../services/firebase';
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading] = useState(false);

  const signIn = async (email: string, _password: string, role: UserRole = 'customer') => {
    const name = email.split('@')[0].replace(/[._-]/g, ' ');
    setUser({ id: Date.now().toString(), email, name, role });
  };

  const signUp = async (email: string, _password: string, name: string, role: UserRole) => {
    setUser({ id: Date.now().toString(), email, name, role });
  };

  const completeWorkerSignup = (data: WorkerData) => {
    setUser((prev) => (prev ? { ...prev, workerData: data } : prev));
  };

  const signOut = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, completeWorkerSignup, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
