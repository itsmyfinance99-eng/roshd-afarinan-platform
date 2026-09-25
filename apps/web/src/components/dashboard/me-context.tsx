'use client';

import type { Permission } from '@roshd/types';
import { createContext, useContext } from 'react';
import type { Me } from './types';

const MeContext = createContext<Me | null>(null);

export const MeProvider = MeContext.Provider;

/** The signed-in user inside the dashboard shell (always present below DashboardShell). */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe() must be used inside <DashboardShell>');
  return me;
}

export function useCan(permission: Permission): boolean {
  return useMe().permissions.includes(permission);
}
