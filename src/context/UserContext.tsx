/**
 * UserContext — état global de l'utilisateur connecté
 * Permet de propager les changements (avatar, nom, etc.) partout dans l'app.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { authService } from '../services/authService';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';
import type { User } from '../types/user';

interface UserContextValue {
  currentUser: User | null;
  loading: boolean;
  refreshUser: () => Promise<User | null>;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const UserContext = createContext<UserContextValue>({
  currentUser: null,
  loading: true,
  refreshUser: async () => null,
  setCurrentUser: () => {},
});

export const useUser = () => useContext(UserContext);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const me = await authService.getMe(true);
      setCurrentUser(me);
      if (me?.id) storage.setItem(STORAGE_KEYS.LAST_USER_ID, String(me.id));
      return me;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    authService.getMe().then(me => {
      setCurrentUser(me);
      if (me?.id) storage.setItem(STORAGE_KEYS.LAST_USER_ID, String(me.id));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({ currentUser, loading, refreshUser, setCurrentUser }),
    [currentUser, loading, refreshUser],
  );

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
