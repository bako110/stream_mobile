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
import { compressVideo } from './videoCompressService';
import { uploadVideoFromUri, uploadImageFromUri } from './uploadService';
import type { VideoFolder, UploadFolder } from './uploadService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadJobType = 'reel' | 'post' | 'event' | 'concert';

export type UploadJobStatus =
  | 'queued'
  | 'compressing'
  | 'uploading'
  | 'done'
  | 'error';

export interface UploadJobResult {
  videoUrl?:      string;
  thumbnailUrl?:  string;
  durationSec?:   number;
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

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id:         CHANNEL_UPLOADS,
    name:       'Publications',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PRIVATE,
  });
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

  getActiveJobs(): UploadJob[] {
    return Array.from(this.jobs.values()).filter(
      j => j.status !== 'done' && j.status !== 'error',
    );
  }

  // ── Enqueue video ───────────────────────────────────────────────────────────

  enqueueVideo(opts: {
    localUri:  string;
    folder:    VideoFolder;
    type:      UploadJobType;
    label:     string;
    onDone:    (result: UploadJobResult) => Promise<void>;
    onError?:  (err: Error) => void;
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
    try {
      this.update(id, { status: 'compressing', progress: 5 });

      const result = await uploadVideoFromUri(
        opts.localUri,
        opts.folder,
        undefined,
        undefined,
        (pct) => {
          const status: UploadJobStatus = pct < 85 ? 'compressing' : 'uploading';
          this.update(id, { status, progress: Math.round(pct * 0.9) });
        },
      );

      this.update(id, { status: 'uploading', progress: 92 });

      const jobResult: UploadJobResult = {
        videoUrl:     result.url,
        thumbnailUrl: result.thumbnail_url,
        durationSec:  result.duration,
      };

      await opts.onDone(jobResult);

      this.update(id, { status: 'done', progress: 100, result: jobResult });
      await this._notifyDone(opts.label);
    } catch (err: any) {
      const message = err?.message ?? 'Erreur inconnue';
      this.update(id, { status: 'error', error: message });
      opts.onError?.(err instanceof Error ? err : new Error(message));
      await this._notifyError(opts.label);
    }
  }

  private async _runImages(
    id:   string,
    opts: Parameters<BackgroundUploadService['enqueueImages']>[0],
  ) {
    await ensureChannel();
    try {
      const total = opts.localUris.length;
      const urls: string[] = [];

      for (let i = 0; i < total; i++) {
        this.update(id, { progress: Math.round((i / total) * 90) });
        const res = await uploadImageFromUri(opts.localUris[i], opts.folder);
        urls.push(res.url);
      }

      this.update(id, { status: 'uploading', progress: 95 });

      const jobResult: UploadJobResult = { imageUrls: urls };
      await opts.onDone(jobResult);

      this.update(id, { status: 'done', progress: 100, result: jobResult });
      await this._notifyDone(opts.label);
    } catch (err: any) {
      const message = err?.message ?? 'Erreur inconnue';
      this.update(id, { status: 'error', error: message });
      opts.onError?.(err instanceof Error ? err : new Error(message));
      await this._notifyError(opts.label);
    }
  }

  private async _runVideoWithImages(
    id:   string,
    opts: Parameters<BackgroundUploadService['enqueueVideoWithImages']>[0],
  ) {
    await ensureChannel();
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
          this.update(id, { status, progress: Math.round(pct * 0.75) });
        },
      );

      // Phase 2 : images (75–90%)
      this.update(id, { status: 'uploading', progress: 75 });
      const imageUrls: string[] = [];
      const total = opts.imageUris.length;

      for (let i = 0; i < total; i++) {
        const res = await uploadImageFromUri(opts.imageUris[i], opts.imageFolder);
        imageUrls.push(res.url);
        this.update(id, { progress: 75 + Math.round(((i + 1) / total) * 15) });
      }

      this.update(id, { progress: 93 });

      const jobResult: UploadJobResult = {
        videoUrl:     videoResult.url,
        thumbnailUrl: videoResult.thumbnail_url,
        durationSec:  videoResult.duration,
        imageUrls,
      };

      await opts.onDone(jobResult);

      this.update(id, { status: 'done', progress: 100, result: jobResult });
      await this._notifyDone(opts.label);
    } catch (err: any) {
      const message = err?.message ?? 'Erreur inconnue';
      this.update(id, { status: 'error', error: message });
      opts.onError?.(err instanceof Error ? err : new Error(message));
      await this._notifyError(opts.label);
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
