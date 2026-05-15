import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

interface ActiveCallState {
  isActive:    boolean;
  partnerId:   string;
  partnerName: string;
  partnerAvatar?: string | null;
  callType:    'voice' | 'video';
  elapsed:     number;
}

interface ActiveCallContextValue {
  activeCall:    ActiveCallState | null;
  startCall:     (info: Omit<ActiveCallState, 'isActive' | 'elapsed'>) => void;
  minimizeCall:  () => void;
  endCall:       () => void;
  tickElapsed:   () => void;
}

const ActiveCallContext = createContext<ActiveCallContextValue>({
  activeCall:   null,
  startCall:    () => {},
  minimizeCall: () => {},
  endCall:      () => {},
  tickElapsed:  () => {},
});

export const useActiveCall = () => useContext(ActiveCallContext);

export const ActiveCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startCall = useCallback((info: Omit<ActiveCallState, 'isActive' | 'elapsed'>) => {
    clearTimer();
    setActiveCall({ ...info, isActive: false, elapsed: 0 });
  }, []);

  const minimizeCall = useCallback(() => {
    setActiveCall(prev => prev ? { ...prev, isActive: true } : null);
    // Démarrer le timer de durée
    clearTimer();
    timerRef.current = setInterval(() => {
      setActiveCall(prev => prev ? { ...prev, elapsed: prev.elapsed + 1 } : null);
    }, 1000);
  }, []);

  const endCall = useCallback(() => {
    clearTimer();
    setActiveCall(null);
  }, []);

  const tickElapsed = useCallback(() => {
    setActiveCall(prev => prev ? { ...prev, elapsed: prev.elapsed + 1 } : null);
  }, []);

  useEffect(() => () => clearTimer(), []);

  return (
    <ActiveCallContext.Provider value={{ activeCall, startCall, minimizeCall, endCall, tickElapsed }}>
      {children}
    </ActiveCallContext.Provider>
  );
};
