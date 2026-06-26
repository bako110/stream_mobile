/**
 * mutationQueueService — stocke les actions faites offline (like, comment, message)
 * et les rejoue automatiquement quand la connexion revient.
 */
import { storage } from '../utils/storage';

const QUEUE_KEY = 'offline:mutation_queue';

export type MutationType =
  | 'like_reel'
  | 'unlike_reel'
  | 'like_post'
  | 'unlike_post'
  | 'like_event'
  | 'unlike_event'
  | 'like_concert'
  | 'unlike_concert'
  | 'comment'
  | 'send_message';

export interface PendingMutation {
  id:         string;
  type:       MutationType;
  payload:    Record<string, any>;
  createdAt:  string;
  retries:    number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readQueue(): PendingMutation[] {
  try {
    const raw = storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingMutation[];
  } catch { return []; }
}

function writeQueue(q: PendingMutation[]): void {
  try { storage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

function uid(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// ── Service ──────────────────────────────────────────────────────────────────

export const mutationQueueService = {
  enqueue(type: MutationType, payload: Record<string, any>): PendingMutation {
    const mutation: PendingMutation = {
      id:        uid(),
      type,
      payload,
      createdAt: new Date().toISOString(),
      retries:   0,
    };
    const q = readQueue();
    q.push(mutation);
    writeQueue(q);
    return mutation;
  },

  dequeue(id: string): void {
    const q = readQueue().filter(m => m.id !== id);
    writeQueue(q);
  },

  getAll(): PendingMutation[] {
    return readQueue();
  },

  count(): number {
    return readQueue().length;
  },

  clear(): void {
    writeQueue([]);
  },

  incrementRetry(id: string): void {
    const q = readQueue().map(m => m.id === id ? { ...m, retries: m.retries + 1 } : m);
    writeQueue(q);
  },

  // Rejoue toutes les mutations en attente — appelé au reconnect
  async flush(executor: (m: PendingMutation) => Promise<void>): Promise<void> {
    const queue = readQueue();
    if (queue.length === 0) return;

    for (const mutation of queue) {
      try {
        await executor(mutation);
        this.dequeue(mutation.id);
      } catch {
        if (mutation.retries >= 3) {
          // Abandon après 3 echecs
          this.dequeue(mutation.id);
        } else {
          this.incrementRetry(mutation.id);
        }
      }
    }
  },
};
