// Notifications du matin sur ce téléphone
import { deB64u } from './push/chiffrement';
import type { CategorieNotif } from './alertes';
import { api } from './session';

export interface EtatPush {
  supporte: boolean;
  permission: NotificationPermission | 'indisponible';
  abonne: boolean;
  endpoint: string;
}

const supporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function abonnementActuel(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function etatPush(): Promise<EtatPush> {
  if (!supporte()) return { supporte: false, permission: 'indisponible', abonne: false, endpoint: '' };
  const a = await abonnementActuel();
  return { supporte: true, permission: Notification.permission, abonne: !!a, endpoint: a?.endpoint ?? '' };
}

export async function activerPush(prefs: CategorieNotif[]): Promise<void> {
  if (!supporte()) throw new Error("Ce téléphone ou ce navigateur ne gère pas les notifications. Utilisez Chrome et ajoutez l'application à l'écran d'accueil.");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error("Notifications refusées. Autorisez-les dans les réglages du navigateur pour ce site, puis réessayez.");
  const { publicKey } = await api<{ publicKey: string }>('/api/push/key');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(publicKey) as BufferSource }));
  await api('/api/push/subscribe', { ...sub.toJSON(), prefs });
}

export async function majPrefs(prefs: CategorieNotif[]): Promise<void> {
  const a = await abonnementActuel();
  if (a) await api('/api/push/prefs', { endpoint: a.endpoint, prefs });
}

export async function desactiverPush(): Promise<void> {
  const a = await abonnementActuel();
  if (!a) return;
  await api('/api/push/unsubscribe', { endpoint: a.endpoint }).catch(() => undefined);
  await a.unsubscribe();
}

export const envoyerTest = () => api<{ envoyes: number; alertes: number }>('/api/push/test', {});
