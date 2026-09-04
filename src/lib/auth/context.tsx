'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase/client';
import type { StaffRole } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  role: StaffRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

async function getUserRole(user: User): Promise<StaffRole | null> {
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/whoami', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { role?: StaffRole | null };
    return payload.role === 'admin' || payload.role === 'usher' ? payload.role : null;
  } catch (err) {
    console.error('Error determining user role:', err);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userRole = await getUserRole(firebaseUser);
        setRole(userRole);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const userRole = await getUserRole(credential.user);
    setRole(userRole);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
