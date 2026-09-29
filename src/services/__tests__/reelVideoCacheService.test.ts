/**
 * Vérifie le comportement critique demandé : un reel déjà en cache ne doit
 * JAMAIS être retéléchargé, et deux appels concurrents sur la même URL ne
 * doivent déclencher qu'UN SEUL téléchargement réseau.
 */

// ── Mock react-native-blob-util : système de fichiers en mémoire ────────────
// Jest interdit aux factories jest.mock() de référencer des variables
// externes non préfixées par "mock" — d'où les noms ci-dessous.
const mockFiles = new Map<string, number>(); // path -> size en octets
let mockFetchCallCount = 0;

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: { CacheDir: '/mock-cache' },
      mkdir: jest.fn().mockResolvedValue(undefined),
      stat: jest.fn((path: string) => {
        if (!mockFiles.has(path)) return Promise.reject(new Error('ENOENT'));
        return Promise.resolve({ size: String(mockFiles.get(path)) });
      }),
      unlink: jest.fn((path: string) => {
        mockFiles.delete(path);
        return Promise.resolve();
      }),
    },
    config: jest.fn((opts: { path: string }) => ({
      fetch: jest.fn((_method: string, _url: string) => {
        mockFetchCallCount += 1;
        // Simule un téléchargement qui prend un peu de temps (pour tester la
        // dédup de deux appels concurrents avant que le premier ne finisse),
        // puis "écrit" le fichier — c'est ce que fs.stat() trouvera ensuite.
        return new Promise(resolve => {
          setTimeout(() => {
            mockFiles.set(opts.path, 1_000_000); // 1 Mo simulé
            resolve(undefined);
          }, 10);
        });
      }),
    })),
  },
}));

// ── Mock storage (MMKV) : simple objet en mémoire ────────────────────────────
const mockKv = new Map<string, string>();
jest.mock('../../utils/storage', () => ({
  storage: {
    getItem: (key: string) => mockKv.get(key) ?? null,
    setItem: (key: string, value: string) => { mockKv.set(key, value); },
  },
}));

let reelVideoCache: typeof import('../reelVideoCacheService');

beforeEach(() => {
  mockFiles.clear();
  mockKv.clear();
  mockFetchCallCount = 0;
  jest.clearAllMocks();
  // Module ré-importé à chaque test : son index (_index, variable de module)
  // ne doit jamais fuiter d'un test à l'autre — isolation complète, pas de
  // dépendance à l'ordre des tests.
  jest.resetModules();
  reelVideoCache = require('../reelVideoCacheService');
});

describe('reelVideoCacheService', () => {
  it('ne retélécharge jamais un fichier déjà en cache (appel séquentiel)', async () => {
    const url = 'https://cdn.example.com/reels/abc.mp4';

    const first = await reelVideoCache.cacheInBackground(url);
    expect(first).toMatch(/^file:\/\//);
    expect(mockFetchCallCount).toBe(1);

    // Deuxième appel — le fichier existe déjà physiquement (via fs.stat mocké)
    const second = await reelVideoCache.cacheInBackground(url);
    expect(second).toBe(first);
    expect(mockFetchCallCount).toBe(1); // TOUJOURS 1 — pas de second download
  });

  it('déduplique deux téléchargements concurrents de la même URL en un seul fetch', async () => {
    const url = 'https://cdn.example.com/reels/concurrent.mp4';

    const [a, b] = await Promise.all([
      reelVideoCache.cacheInBackground(url),
      reelVideoCache.cacheInBackground(url),
    ]);

    expect(a).toBe(b);
    expect(mockFetchCallCount).toBe(1); // un seul fetch malgré les 2 appels simultanés
  });

  it('getLocalUri retourne null tant que rien n\'est en cache, puis le chemin local après téléchargement', async () => {
    const url = 'https://cdn.example.com/reels/sync-check.mp4';
    expect(reelVideoCache.getLocalUri(url)).toBeNull();

    await reelVideoCache.cacheInBackground(url);
    expect(reelVideoCache.getLocalUri(url)).toMatch(/^file:\/\//);
  });

  it('invalidateCacheEntry force un retéléchargement à l\'appel suivant', async () => {
    const url = 'https://cdn.example.com/reels/invalidate-me.mp4';

    await reelVideoCache.cacheInBackground(url);
    expect(mockFetchCallCount).toBe(1);

    reelVideoCache.invalidateCacheEntry(url);
    expect(reelVideoCache.getLocalUri(url)).toBeNull();

    await reelVideoCache.cacheInBackground(url);
    expect(mockFetchCallCount).toBe(2); // retélécharge, car l'entrée a été invalidée explicitement
  });

  it('deux URLs différentes déclenchent bien deux téléchargements distincts', async () => {
    await reelVideoCache.cacheInBackground('https://cdn.example.com/reels/one.mp4');
    await reelVideoCache.cacheInBackground('https://cdn.example.com/reels/two.mp4');
    expect(mockFetchCallCount).toBe(2);
  });
});
