import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AppRole, Profile } from '../types/database';

interface AuthContextType {
  role: AppRole;
  profile: Profile | null;
  isLoading: boolean;
  isConfigured: boolean;
  isStaff: boolean;
  isGuru: boolean;
  isStudent: boolean;
  signIn: (email: string, pass: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  switchDemoRole: (role: AppRole) => void;
}

const DEFAULT_COORDINATOR_PROFILE: Profile = {
  id: 'coord-test-1',
  role: 'coordinator',
  full_name: 'Govinda Dasa',
  email: 'coordinator@mridanga.org',
  phone: '+91 98490 12345',
  centre_id: 1,
  is_treasurer: false,
  language: 'en',
  active: true,
  created_at: new Date().toISOString(),
};

const AuthContext = createContext<AuthContextType>({
  role: 'coordinator',
  profile: DEFAULT_COORDINATOR_PROFILE,
  isLoading: false,
  isConfigured: false,
  isStaff: true,
  isGuru: false,
  isStudent: false,
  signIn: async () => ({}),
  signOut: async () => {},
  switchDemoRole: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<AppRole>('coordinator');
  const [profile, setProfile] = useState<Profile | null>(DEFAULT_COORDINATOR_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAuth() {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (prof) {
            setProfile(prof as Profile);
            setRole(prof.role);
          }
        }
      } catch (err) {
        console.warn('Auth check error, falling back to demo state:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadAuth();

    if (isSupabaseConfigured) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (prof) {
            setProfile(prof as Profile);
            setRole(prof.role);
          }
        } else {
          setProfile(DEFAULT_COORDINATOR_PROFILE);
          setRole('guru');
        }
      });

      return () => {
        authListener?.subscription.unsubscribe();
      };
    }
  }, []);

  const signIn = async (email: string, pass: string) => {
    if (!isSupabaseConfigured) {
      // Demo authentication simulation
      const newRole: AppRole = email.includes('guru') ? 'guru' : email.includes('student') ? 'student' : 'coordinator';
      const newProf: Profile = {
        id: 'demo-' + newRole,
        role: newRole,
        full_name: newRole === 'guru' ? 'Sri Guru Maharaj' : newRole === 'student' ? 'Arjun Rao' : 'Govinda Dasa',
        email,
        centre_id: 1,
        is_treasurer: false,
        language: 'en',
        active: true,
        created_at: new Date().toISOString(),
      };
      setProfile(newProf);
      setRole(newRole);
      return {};
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return { error: error.message };
    return {};
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setProfile(null);
    setRole('pending');
  };

  const switchDemoRole = (newRole: AppRole) => {
    setRole(newRole);
    setProfile({
      id: 'demo-' + newRole,
      role: newRole,
      full_name: newRole === 'guru' ? 'Sri Guru Maharaj' : newRole === 'student' ? 'Arjun Rao' : 'Govinda Dasa (Coordinator)',
      email: `${newRole}@example.com`,
      centre_id: 1,
      is_treasurer: false,
      language: 'en',
      active: true,
      created_at: new Date().toISOString(),
    });
  };

  const isStaff = role === 'guru' || role === 'coordinator';
  const isGuru = role === 'guru';
  const isStudent = role === 'student';

  return (
    <AuthContext.Provider
      value={{
        role,
        profile,
        isLoading,
        isConfigured: isSupabaseConfigured,
        isStaff,
        isGuru,
        isStudent,
        signIn,
        signOut,
        switchDemoRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
