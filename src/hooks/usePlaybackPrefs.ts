import { storage } from '../utils/storage';

const STORAGE_KEY = 'playback_prefs';

export interface PlaybackPrefs {
  autoplay:     boolean;
  hd_streaming: boolean;
}

const DEFAULTS: PlaybackPrefs = { autoplay: true, hd_streaming: false };

export function getPlaybackPrefs(): PlaybackPrefs {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}
