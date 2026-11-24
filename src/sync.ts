// Synchronisation : envoie les saisies en attente, récupère celles des autres téléphones.
import { countDirty, dirtyRecords, getMeta, getRecord, putRecord, setMeta, type Rec } from './db';
import { ApiError, api, clearToken, getToken, getUser } from './session';

export interface SyncState {
  syncing: boolean;
  pending: number;
  lastSync: number | null;
  error: string | null;
  needLogin: boolean;
}

let state: SyncState = { syncing: false, pending: 0, lastSync: null, error: null, needLogin: false };
const listeners = new Set<() => void>();

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getState = () => state;
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshPending() {
  set({ pending: await countDirty() });
}

// Heure du serveur : évite qu'une horloge de téléphone mal réglée écrase les autres saisies.
async function now(): Promise<number> {
  const offset = (await getMeta<number>('clockOffset')) ?? 0;
  return Date.now() + offset;
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function saveRecord(collection: string, id: string, data: object, deleted = false) {
  const rec: Rec = {
    id,
    collection,
    data: data as Record<string, unknown>,
    updatedAt: await now(),
    deleted,
    author: getUser()?.name ?? '',
    dirty: 1
  };
  await putRecord(rec);
  await refreshPending();
  await notifyData();
  scheduleSync();
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSync(delay = 400) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

interface SyncResponse {
  serverTime: number;
  seq: number;
  more: boolean;
  records: Array<Omit<Rec, 'dirty'>>;
}

export async function syncNow(): Promise<void> {
  if (state.syncing || !getToken() || !navigator.onLine) return;
  set({ syncing: true, error: null });
  try {
    let more = true;
    while (more) {
      const since = (await getMeta<number>('lastSeq')) ?? 0;
      const pushed = await dirtyRecords(100);
      const res = await api<SyncResponse>('/api/sync', {
        since,
        changes: pushed.map((r) => ({
          id: r.id,
          collection: r.collection,
          data: r.data,
          updatedAt: r.updatedAt,
          deleted: r.deleted
        }))
      });
      await setMeta('clockOffset', res.serverTime - Date.now());
      // une saisie modifiée pendant l'envoi reste « en attente »
      for (const p of pushed) {
        const local = await getRecord(p.id);
        if (local && local.updatedAt === p.updatedAt) await putRecord({ ...local, dirty: 0 });
      }
      for (const r of res.records) {
        const local = await getRecord(r.id);
        if (local && local.dirty === 1 && local.updatedAt > r.updatedAt) continue;
        await putRecord({ ...r, dirty: 0 });
      }
      await setMeta('lastSeq', res.seq);
      more = res.more || (pushed.length === 100);
    }
    set({ lastSync: Date.now() });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      clearToken();
      set({ needLogin: true });
    } else {
      set({ error: e instanceof Error ? e.message : 'Erreur de synchronisation' });
    }
  } finally {
    set({ syncing: false });
    await refreshPending();
    notifyData();
  }
}

// Les écrans écoutent ce signal pour se rafraîchir quand des données arrivent.
const dataListeners = new Set<() => void | Promise<void>>();
export function onData(fn: () => void | Promise<void>) {
  dataListeners.add(fn);
  return () => dataListeners.delete(fn);
}
// Rend la main quand les écrans ont fini de se mettre à jour.
export function notifyData(): Promise<void> {
  return Promise.all([...dataListeners].map((l) => l())).then(() => undefined);
}

export function startAutoSync(): () => void {
  const go = () => void syncNow();
  window.addEventListener('online', go);
  const vis = () => document.visibilityState === 'visible' && go();
  document.addEventListener('visibilitychange', vis);
  const iv = setInterval(go, 30_000);
  void refreshPending();
  go();
  return () => {
    window.removeEventListener('online', go);
    document.removeEventListener('visibilitychange', vis);
    clearInterval(iv);
  };
}

export function resetNeedLogin() {
  set({ needLogin: false });
}
