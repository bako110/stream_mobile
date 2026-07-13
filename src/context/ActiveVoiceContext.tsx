import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AudioRecorderPlayerModule = require('react-native-audio-recorder-player');
const AudioRecorderPlayerClass = AudioRecorderPlayerModule.default || AudioRecorderPlayerModule;

// Instance unique partagee entre tous les ecrans de chat (Chat/CommunityChat/
// CommunityChannelChat) — auparavant chaque ecran possedait sa propre instance
// locale au module, jamais arretee au demontage : quitter la conversation en
// cours de lecture laissait le vocal jouer indefiniment en arriere-plan sans
// aucun moyen de le voir/controler. En centralisant l'instance et l'etat ici,
// la lecture survit a la navigation et une barre flottante peut la piloter.
const audioPlayer = new AudioRecorderPlayerClass();

export type VoiceSource = 'chat' | 'community' | 'channel';

interface ActiveVoiceState {
  messageId:   string;
  url:         string;
  title:       string;        // nom de la conversation/du canal a afficher
  avatarUrl:   string | null;
  source:      VoiceSource;
  returnParams: any;          // params de navigation pour revenir a la conversation
  progress:    number;        // ms
  duration:    number;        // ms
  isPlaying:   boolean;
}

interface ActiveVoiceContextValue {
  activeVoice: ActiveVoiceState | null;
  playVoice: (info: {
    messageId: string; url: string; title: string; avatarUrl: string | null;
    source: VoiceSource; returnParams: any;
  }) => Promise<void>;
  togglePause: () => Promise<void>;
  stopVoice: () => Promise<void>;
}

const ActiveVoiceContext = createContext<ActiveVoiceContextValue>({
  activeVoice: null,
  playVoice: async () => {},
  togglePause: async () => {},
  stopVoice: async () => {},
});

export const useActiveVoice = () => useContext(ActiveVoiceContext);

export const ActiveVoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeVoice, setActiveVoice] = useState<ActiveVoiceState | null>(null);
  const activeVoiceRef = useRef<ActiveVoiceState | null>(null);
  activeVoiceRef.current = activeVoice;

  const clearListener = () => {
    try { audioPlayer.removePlayBackListener(); } catch {}
  };

  const stopVoice = useCallback(async () => {
    try { await audioPlayer.stopPlayer(); } catch {}
    clearListener();
    setActiveVoice(null);
  }, []);

  const playVoice = useCallback(async (info: {
    messageId: string; url: string; title: string; avatarUrl: string | null;
    source: VoiceSource; returnParams: any;
  }) => {
    // Meme message déjà en lecture → toggle pause au lieu de relancer depuis le debut.
    if (activeVoiceRef.current?.messageId === info.messageId) {
      if (activeVoiceRef.current.isPlaying) {
        try { await audioPlayer.pausePlayer(); } catch {}
        setActiveVoice(prev => prev ? { ...prev, isPlaying: false } : prev);
      } else {
        try { await audioPlayer.resumePlayer(); } catch {}
        setActiveVoice(prev => prev ? { ...prev, isPlaying: true } : prev);
      }
      return;
    }

    // Un autre vocal joue deja : l'arreter avant de demarrer le nouveau.
    if (activeVoiceRef.current) {
      try { await audioPlayer.stopPlayer(); } catch {}
      clearListener();
    }

    setActiveVoice({
      messageId: info.messageId, url: info.url, title: info.title, avatarUrl: info.avatarUrl,
      source: info.source, returnParams: info.returnParams,
      progress: 0, duration: 0, isPlaying: true,
    });

    try {
      await audioPlayer.startPlayer(info.url);
      audioPlayer.addPlayBackListener((e: any) => {
        if (e.currentPosition >= e.duration - 100) {
          try { audioPlayer.stopPlayer(); } catch {}
          clearListener();
          setActiveVoice(null);
          return;
        }
        setActiveVoice(prev => prev ? { ...prev, progress: e.currentPosition, duration: e.duration } : prev);
      });
    } catch {
      setActiveVoice(null);
    }
  }, []);

  const togglePause = useCallback(async () => {
    const current = activeVoiceRef.current;
    if (!current) return;
    if (current.isPlaying) {
      try { await audioPlayer.pausePlayer(); } catch {}
      setActiveVoice(prev => prev ? { ...prev, isPlaying: false } : prev);
    } else {
      try { await audioPlayer.resumePlayer(); } catch {}
      setActiveVoice(prev => prev ? { ...prev, isPlaying: true } : prev);
    }
  }, []);

  return (
    <ActiveVoiceContext.Provider value={{ activeVoice, playVoice, togglePause, stopVoice }}>
      {children}
    </ActiveVoiceContext.Provider>
  );
};
