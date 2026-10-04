'use client';

import type { AuthSessionView } from '@dike/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { loadSession } from '../../lib/auth-client';

interface AuthContextValue {
  session: AuthSessionView | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['auth-session'], queryFn: loadSession, retry: false });
  useEffect(() => {
    const channel = new BroadcastChannel('dike-auth');
    channel.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['auth-session'] });
      void queryClient.invalidateQueries({ queryKey: ['workflow'] });
    };
    return () => channel.close();
  }, [queryClient]);
  return (
    <AuthContext.Provider
      value={{
        session: query.data,
        loading: query.isPending,
        refresh: async () => {
          await query.refetch();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function broadcastAuthChange(): void {
  const channel = new BroadcastChannel('dike-auth');
  channel.postMessage('changed');
  channel.close();
}
