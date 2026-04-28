import React, { createContext, useState, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { createTheme, AppTheme } from '../theme';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();

  // Persiste le choix de thème dans MMKV
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (storage.getItem(STORAGE_KEYS.THEME_MODE) as ThemeMode) ?? 'system';
  });

  const isDark = useMemo(() => {
    if (mode === 'system') return systemScheme === 'dark';
    return mode === 'dark';
  }, [mode, systemScheme]);

  const theme = useMemo(() => createTheme(isDark), [isDark]);

  const setMode = useCallback((m: ThemeMode) => {
    storage.setItem(STORAGE_KEYS.THEME_MODE, m);
    setModeState(m);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  const value = useMemo(
    () => ({ theme, mode, isDark, setMode, toggleTheme }),
    [theme, mode, isDark, setMode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
