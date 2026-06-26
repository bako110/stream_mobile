import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

interface NetworkContextValue {
  isOnline: boolean;
  isInternetReachable: boolean;
  connectionType: string | null;
  addReconnectListener: (fn: () => void) => void;
  removeReconnectListener: (fn: () => void) => void;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  isInternetReachable: true,
  connectionType: null,
  addReconnectListener: () => {},
  removeReconnectListener: () => {},
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline,             setIsOnline]             = useState(true);
  const [isInternetReachable,  setIsInternetReachable]  = useState(true);
  const [connectionType,       setConnectionType]       = useState<string | null>(null);

  const reconnectListeners = useRef<Set<() => void>>(new Set());
  const wasOnlineRef       = useRef(true);

  const addReconnectListener    = useCallback((fn: () => void) => { reconnectListeners.current.add(fn); },    []);
  const removeReconnectListener = useCallback((fn: () => void) => { reconnectListeners.current.delete(fn); }, []);

  useEffect(() => {
    const handleState = (state: NetInfoState) => {
      const online    = state.isConnected ?? false;
      const reachable = state.isInternetReachable ?? false;

      setIsOnline(online);
      setIsInternetReachable(reachable);
      setConnectionType(state.type ?? null);

      // Transition offline → online : notifier tous les listeners
      if (!wasOnlineRef.current && online && reachable) {
        reconnectListeners.current.forEach(fn => { try { fn(); } catch {} });
      }
      wasOnlineRef.current = online && reachable;
    };

    // Etat initial
    NetInfo.fetch().then(handleState);

    const unsub = NetInfo.addEventListener(handleState);
    return () => unsub();
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, isInternetReachable, connectionType, addReconnectListener, removeReconnectListener }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);
