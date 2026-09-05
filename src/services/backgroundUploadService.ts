/**
 * backgroundUploadService — queue d'uploads vidéo en arrière-plan.
 *
 * Flux :
 *   enqueue() → compression immédiate → upload R2 → callback onDone → notification Notifee
 *
 * L'appelant reçoit immédiatement un `jobId` et peut quitter l'écran.
 * Il s'abonne aux événements via addListener() / removeListener().
 */
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { Platform } from 'react-native';
import { uploadVideoFromUri, uploadImageFromUri } from './uploadService';
import type { VideoFolder, UploadFolder } from './uploadService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadJobType = 'reel' | 'post' | 'event' | 'concert' | 'message';

export type UploadJobStatus =
  | 'queued'
  | 'compressing'
  | 'uploading'
  | 'done'
  | 'error';

export interface UploadJobResult {
  videoUrl?:      string;
  hlsUrl?:        string;
  mp4Url?:        string;
  thumbnailUrl?:  string;
  durationSec?:   number;
  videoWidth?:    number | null;
  videoHeight?:   number | null;
  imageUrls?:     string[];
}

export interface UploadJob {
  id:         string;
  type:       UploadJobType;
  status:     UploadJobStatus;
  progress:   number;         // 0-100
  label:      string;
  result?:    UploadJobResult;
  error?:     string;
  createdAt:  number;
}

export type UploadEventListener = (job: UploadJob) => void;

// ── Channel Notifee ───────────────────────────────────────────────────────────

const CHANNEL_UPLOADS = 'uploads_v1';
// Notification unique qui porte le foreground service — partagée par tous les
// uploads simultanés (ref-count par job dans ForegroundGuard.active).
const FGS_NOTIF_ID = 'upload_fgs';

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id:         CHANNEL_UPLOADS,
    name:       'Publications',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PRIVATE,
  });
}

// ── Foreground service — gestion "intelligente" ──────────────────────────────
//
// Objectifs :
//   • ne démarrer le FGS QUE pour un vrai upload de fichier (vidéo / images) —
//     pas pour un simple POST de 2 s (track), sinon la notif apparaît/disparaît
//     en un éclair pour rien ;
//   • une seule notification, partagée par tous les uploads simultanés
//     (ref-count par job, pas un compteur écrasable) ;
//   • un seul displayNotification au démarrage, puis des updates de progression
//     throttlés (pas un re-display complet à chaque %) ;
//   • un délai de garde PAR job (basé sur le plus ancien), qui ne peut pas être
//     effacé par le démarrage d'un job plus récent ;
//   • robustesse si Notifee n'a pas encore appelé son runner (résolveur en file
//     d'attente), et no-op propre si on stoppe alors qu'aucun job ne tourne.
//
// Le runner enregistré par registerForegroundService() ne fait rien d'autre que
// rester en vie : sa promesse est résolue par ForegroundGuard.stop() quand plus
// aucun job actif ne le retient.

const FGS_MAX_MS       = 12 * 60_000;  // garde dure : 12 min par job (Android dataSync ~6h)
const FGS_UPDATE_MIN_MS = 800;         // throttle des updates de progression

class ForegroundGuard {
  /** id job -> timestamp de démarrage (pour la garde dure basée sur le + ancien) */
  private active = new Map<string, number>();
  /** résolveurs fournis par le runner Notifee, consommés au stop */
  private resolvers: Array<() => void> = [];
  private notifShown = false;
  private lastUpdateAt = 0;
  private guardTimer: ReturnType<typeof setInterval> | null = null;
  private lastLabel = 'Publication';

  /** Appelé par registerForegroundService : Notifee (ré)invoque ce runner à
      chaque affichage d'une notif asForegroundService. */
  bindRunner(resolve: () => void) {
    // Si un stop est déjà demandé (plus aucun job), on résout tout de suite.
    if (this.active.size === 0) { resolve(); return; }
    this.resolvers.push(resolve);
  }

  private drainResolvers() {
    const rs = this.resolvers.splice(0);
    rs.forEach(r => { try { r(); } catch {} });
  }

  private notifPayload(label: string, pct: number | null) {
    return {
      id:    FGS_NOTIF_ID,
      title: 'Publication en cours…',
      body:  label,
      android: {
        channelId:           CHANNEL_UPLOADS,
        asForegroundService: true,
        ongoing:             true,
        onlyAlertOnce:       true,
        autoCancel:          false,
        smallIcon:           'ic_notification',
        pressAction:         { id: 'default', launchActivity: 'default' as const },
        progress: pct == null
          ? { max: 100, current: 0, indeterminate: true }
          : { max: 100, current: Math.max(1, Math.min(100, Math.round(pct))), indeterminate: false },
      },
    };
  }

  /** À appeler au tout début d'un upload de fichier. */
  async begin(jobId: string, label: string) {
    if (Platform.OS !== 'android') return;
    this.lastLabel = label || this.lastLabel;
    this.active.set(jobId, Date.now());

    if (!this.notifShown) {
      this.notifShown = true;
      try { await notifee.displayNotification(this.notifPayload(this.lastLabel, null)); }
      catch { this.notifShown = false; }
    }

    // Garde dure : vérifie périodiquement le job le plus ancien ; s'il dépasse
    // FGS_MAX_MS on l'oublie (le upload lui-même continuera peut-être, mais on ne
    // retient plus le FGS pour lui — évite une notif "en cours" bloquée à vie).
    if (!this.guardTimer) {
      this.guardTimer = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [id, started] of this.active) {
          if (now - started > FGS_MAX_MS) { this.active.delete(id); changed = true; }
        }
        if (changed && this.active.size === 0) this.stop(jobId, /*force*/ true);
      }, 30_000);
    }
  }

  /** Progression d'un upload (0-100). Throttlé. */
  async progress(pct: number, label?: string) {
    if (Platform.OS !== 'android' || this.active.size === 0 || !this.notifShown) return;
    const now = Date.now();
    if (now - this.lastUpdateAt < FGS_UPDATE_MIN_MS && pct < 100) return;
    this.lastUpdateAt = now;
    if (label) this.lastLabel = label;
    try { await notifee.displayNotification(this.notifPayload(this.lastLabel, pct)); }
    catch {}
  }

  /** À appeler dans le finally de chaque upload de fichier. */
  async stop(jobId: string, force = false) {
    if (Platform.OS !== 'android') return;
    this.active.delete(jobId);
    if (!force && this.active.size > 0) return;      // d'autres uploads tournent

    if (this.guardTimer) { clearInterval(this.guardTimer); this.guardTimer = null; }
    this.active.clear();
    this.drainResolvers();                            // libère le runner Notifee
    this.notifShown = false;
    this.lastUpdateAt = 0;
    try { await notifee.stopForegroundService(); } catch {}
  }
}

const _foreground = new ForegroundGuard();

// À appeler UNE fois au démarrage (index.js), au scope module.
let _fgsRegistered = false;
export function registerUploadForegroundService() {
  if (_fgsRegistered || Platform.OS !== 'android') return;
  _fgsRegistered = true;
  notifee.registerForegroundService(() => new Promise<void>((resolve) => {
    _foreground.bindRunner(resolve);
  }));
}

// ── Service singleton ─────────────────────────────────────────────────────────

class BackgroundUploadService {
  private jobs     = new Map<string, UploadJob>();
  private listeners = new Set<UploadEventListener>();
  private counter  = 0;

  private emit(job: UploadJob) {
    this.listeners.forEach(fn => { try { fn(job); } catch {} });
  }

  private update(id: string, patch: Partial<Omit<UploadJob, 'id'>>) {
    const job = this.jobs.get(id);
    if (!job) return;
    const next = { ...job, ...patch };
    this.jobs.set(id, next);
    this.emit(next);
  }

  addListener(fn: UploadEventListener)    { this.listeners.add(fn); }
  removeListener(fn: UploadEventListener) { this.listeners.delete(fn); }

  getJob(id: string): UploadJob | undefined { return this.jobs.get(id); }

  // ── Track générique ────────────────────────────────────────────────────────
  // Enveloppe N'IMPORTE QUELLE promesse de création (post texte, event, concert,
  // reel sans upload local, etc.) dans un job visible : un indicateur "en cours"
  // s'affiche en haut de l'écran, puis "Publié ✓" ou "Échec" à la résolution.
  // À utiliser quand il n'y a pas de fichier à uploader (sinon enqueueVideo /
  // enqueueImages font déjà le suivi). Retourne la promesse d'origine.
  async track<T>(type: UploadJobType, label: string, task: () => Promise<T>): Promise<T> {
    const id = `job_${Date.now()}_${++this.counter}`;
    const job: UploadJob = {
      id,
      type,
      status:    'uploading',
      progress:  30,
      label,
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.emit(job);
    // Pas de foreground service ici : `track` sert aux créations SANS fichier
    // (POST texte / event / concert…), qui durent < 2 s. Un FGS ferait
    // apparaître/disparaître une notif "en cours" pour rien. Le suivi visuel est
    // assuré par la pill in-app (UploadProgressBanner).
    try {
      const result = await task();
      this.update(id, { status: 'done', progress: 100 });
      return result;
    } catch (err: any) {
      this.update(id, { status: 'error', error: err?.message ?? 'Erreur inconnue' });
      throw err;
    }
  }

  getActiveJobs(): UploadJob[] {
    return Array.from(this.jobs.values()).filter(
      j => j.status !== 'done' && j.status !== 'error',
    );
  }

  // ── Enqueue video ───────────────────────────────────────────────────────────

  enqueueVideo(opts: {
    localUri:   string;
    folder:     VideoFolder;
    type:       UploadJobType;
    label:      string;
    trimStart?: number;
    trimEnd?:   number;
    onDone:     (result: UploadJobResult) => Promise<void>;
    onError?:   (err: Error) => void;
  }): string {
    const id = `job_${Date.now()}_${++this.counter}`;
    const job: UploadJob = {
      id,
      type:      opts.type,
      status:    'queued',
      progress:  0,
      label:     opts.label,
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.emit(job);

    this._runVideo(id, opts).catch(() => {});
    return id;
  }

  // ── Enqueue message video (chat 1-to-1 ou community) ───────────────────────

  enqueueMessageVideo(opts: {
    localUri:  string;
    label:     string;
    onDone:    (result: UploadJobResult) => Promise<void>;
    onError?:  (err: Error) => void;
  }): string {
    return this.enqueueVideo({
      localUri: opts.localUri,
      folder:   'messages',
      type:     'message',
      label:    opts.label,
      onDone:   opts.onDone,
      onError:  opts.onError,
    });
  }

  // ── Enqueue images (post with mixed images) ─────────────────────────────────

  enqueueImages(opts: {
    localUris: string[];
    folder:    UploadFolder;
    type:      UploadJobType;
    label:     string;
    onDone:    (result: UploadJobResult) => Promise<void>;
    onError?:  (err: Error) => void;
  }): string {
    const id = `job_${Date.now()}_${++this.counter}`;
    const job: UploadJob = {
      id,
      type:      opts.type,
      status:    'uploading',
      progress:  0,
      label:     opts.label,
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.emit(job);

    this._runImages(id, opts).catch(() => {});
    return id;
  }

  // ── Enqueue video + images (post avec une vidéo) ────────────────────────────

  enqueueVideoWithImages(opts: {
    videoUri:    string;
    imageUris:   string[];
    videoFolder: VideoFolder;
    imageFolder: UploadFolder;
    type:        UploadJobType;
    label:       string;
    trimStart?:  number;
    trimEnd?:    number;
    onDone:      (result: UploadJobResult) => Promise<void>;
    onError?:    (err: Error) => void;
  }): string {
    const id = `job_${Date.now()}_${++this.counter}`;
    const job: UploadJob = {
      id,
      type:      opts.type,
      status:    'queued',
      progress:  0,
      label:     opts.label,
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.emit(job);

    this._runVideoWithImages(id, opts).catch(() => {});
    return id;
  }

  // ── Private runners ─────────────────────────────────────────────────────────

  private async _runVideo(
    id:   string,
    opts: Parameters<BackgroundUploadService['enqueueVideo']>[0],
  ) {
    await ensureChannel();
    await _foreground.begin(id, opts.label);
    try {
      this.update(id, { status: 'compressing', progress: 5 });

      const result = await uploadVideoFromUri(
        opts.localUri,
        opts.folder,
        undefined,
        undefined,
        (pct) => {
          const status: UploadJobStatus = pct < 85 ? 'compressing' : 'uploading';
          const p = Math.min(99, Math.round(pct * 0.9));
          this.update(id, { status, progress: p });
          _foreground.progress(p, opts.label);
        },
      );

      const jobResult: UploadJobResult = {
        videoUrl:     result.url,
        hlsUrl:       result.hls_url,
        mp4Url:       result.mp4_url,
        thumbnailUrl: result.thumbnail_url,
        durationSec:  result.duration,
        videoWidth:   result.width  ?? null,
        videoHeight:  result.height ?? null,
      };

      this.update(id, { status: 'done', progress: 100, result: jobResult });
      await this._notifyDone(opts.label);

      opts.onDone(jobResult).catch(err => {
        console.warn('[backgroundUpload] onDone error:', err?.message ?? err);
      });
    } catch (err: any) {
      const message = err?.message ?? 'Erreur inconnue';
      this.update(id, { status: 'error', error: message });
      opts.onError?.(err instanceof Error ? err : new Error(message));
      await this._notifyError(opts.label);
    } finally {
      await _foreground.stop(id);
    }
  }

  private async _runImages(
    id:   string,
    opts: Parameters<BackgroundUploadService['enqueueImages']>[0],
  ) {
    await ensureChannel();
    await _foreground.begin(id, opts.label);
    try {
      const total = opts.localUris.length;
      const urls: string[] = [];

      for (let i = 0; i < total; i++) {
        const p = Math.round((i / total) * 90);
        this.update(id, { progress: p });
        _foreground.progress(p, opts.label);
        const res = await uploadImageFromUri(opts.localUris[i], opts.folder);
        urls.push(res.url);
      }

      this.update(id, { status: 'uploading', progress: 95 });
      _foreground.progress(95, opts.label);

      const jobResult: UploadJobResult = { imageUrls: urls };
      await opts.onDone(jobResult);

      this.update(id, { status: 'done', progress: 100, result: jobResult });
      await this._notifyDone(opts.label);
    } catch (err: any) {
      const message = err?.message ?? 'Erreur inconnue';
      this.update(id, { status: 'error', error: message });
      opts.onError?.(err instanceof Error ? err : new Error(message));
      await this._notifyError(opts.label);
    } finally {
      await _foreground.stop(id);
    }
  }

  private async _runVideoWithImages(
    id:   string,
    opts: Parameters<BackgroundUploadService['enqueueVideoWithImages']>[0],
  ) {
    await ensureChannel();
    await _foreground.begin(id, opts.label);
    try {
      // Phase 1 : compression + upload vidéo (0–75%)
      this.update(id, { status: 'compressing', progress: 5 });

      const videoResult = await uploadVideoFromUri(
        opts.videoUri,
        opts.videoFolder,
        undefined,
        undefined,
        (pct) => {
          const status: UploadJobStatus = pct < 85 ? 'compressing' : 'uploading';
          const p = Math.min(99, Math.round(pct * 0.75));
          this.update(id, { status, progress: p });
          _foreground.progress(p, opts.label);
        },
      );

      // Phase 2 : images (75–90%)
      this.update(id, { status: 'uploading', progress: 75 });
      const imageUrls: string[] = [];
      const total = opts.imageUris.length;

      for (let i = 0; i < total; i++) {
        const res = await uploadImageFromUri(opts.imageUris[i], opts.imageFolder);
        imageUrls.push(res.url);
        const p = 75 + Math.round(((i + 1) / total) * 15);
        this.update(id, { progress: p });
        _foreground.progress(p, opts.label);
      }

      this.update(id, { progress: 93 });

      const jobResult: UploadJobResult = {
        videoUrl:     videoResult.url,
        hlsUrl:       videoResult.hls_url,
        mp4Url:       videoResult.mp4_url,
        thumbnailUrl: videoResult.thumbnail_url,
        durationSec:  videoResult.duration,
        videoWidth:   videoResult.width  ?? null,
        videoHeight:  videoResult.height ?? null,
        imageUrls,
      };

      this.update(id, { status: 'done', progress: 100, result: jobResult });
      await this._notifyDone(opts.label);

      opts.onDone(jobResult).catch(err => {
        console.warn('[backgroundUpload] onDone error:', err?.message ?? err);
      });
    } catch (err: any) {
      const message = err?.message ?? 'Erreur inconnue';
      this.update(id, { status: 'error', error: message });
      opts.onError?.(err instanceof Error ? err : new Error(message));
      await this._notifyError(opts.label);
    } finally {
      await _foreground.stop(id);
    }
  }

  // ── Notifications ───────────────────────────────────────────────────────────

  private async _notifyDone(label: string) {
    try {
      await notifee.displayNotification({
        id:    `upload_done_${Date.now()}`,
        title: 'Publication en ligne !',
        body:  `"${label}" est maintenant visible par tes abonnés.`,
        android: {
          channelId:   CHANNEL_UPLOADS,
          importance:  AndroidImportance.DEFAULT,
          pressAction: { id: 'default', launchActivity: 'default' },
          smallIcon:   'ic_notification',
        },
      });
    } catch {}
  }

  private async _notifyError(label: string) {
    try {
      await notifee.displayNotification({
        id:    `upload_err_${Date.now()}`,
        title: 'Erreur de publication',
        body:  `La publication de "${label}" a échoué. Réessaie.`,
        android: {
          channelId:   CHANNEL_UPLOADS,
          importance:  AndroidImportance.DEFAULT,
          pressAction: { id: 'default', launchActivity: 'default' },
          smallIcon:   'ic_notification',
        },
      });
    } catch {}
  }
}

export const backgroundUploadService = new BackgroundUploadService();
