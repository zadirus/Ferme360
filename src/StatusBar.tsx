import { useEffect, useState } from 'preact/hooks';
import { getState, subscribe, syncNow } from './sync';

export function StatusBar() {
  const [s, setS] = useState(getState());
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => subscribe(() => setS(getState())), []);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', up);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', up);
    };
  }, []);

  let texte: string;
  let classe = 'ok';
  if (!online) {
    classe = 'hors';
    texte = s.pending ? `Hors ligne · ${s.pending} saisie(s) en attente` : 'Hors ligne · tout est enregistré sur le téléphone';
  } else if (s.syncing) {
    classe = 'attente';
    texte = 'Synchronisation…';
  } else if (s.error) {
    classe = 'hors';
    texte = `Synchronisation impossible (${s.error})`;
  } else if (s.pending) {
    classe = 'attente';
    texte = `${s.pending} saisie(s) à envoyer`;
  } else {
    texte = 'À jour';
  }

  return (
    <div class={`barre ${classe}`} role="status">
      <span>{texte}</span>
      <button type="button" disabled={!online || s.syncing} onClick={() => void syncNow()}>
        Synchroniser
      </button>
    </div>
  );
}
