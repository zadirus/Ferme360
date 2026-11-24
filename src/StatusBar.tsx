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
    texte = s.pending ? `Hors ligne · ${s.pending} saisie(s) en attente` : 'Hors ligne';
  } else if (s.syncing) {
    classe = 'attente';
    texte = 'Synchronisation…';
  } else if (s.error) {
    classe = 'hors';
    texte = 'Synchronisation impossible';
  } else if (s.pending) {
    classe = 'attente';
    texte = `${s.pending} à envoyer`;
  } else {
    texte = 'À jour';
  }

  return (
    <button type="button" class={`pastille ${classe}`} role="status" disabled={!online || s.syncing} onClick={() => void syncNow()} aria-label="Synchroniser">
      {texte}
    </button>
  );
}
