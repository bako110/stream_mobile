/**
 * UserContext — état global de l'utilisateur connecté
 * Permet de propager les changements (avatar, nom, etc.) partout dans l'app.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authService } from '../services/authService';
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
      return me;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    authService.getMe().then(me => {
      setCurrentUser(me);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <UserContext.Provider value={{ currentUser, loading, refreshUser, setCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
};
