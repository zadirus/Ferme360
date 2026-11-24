import { useEffect, useState } from 'preact/hooks';

const activites = [
  { nom: 'Poules pondeuses', detail: 'Ramassage, mortalité, œufs' },
  { nom: 'Moutons', detail: 'Registre, naissances, pesées' },
  { nom: 'Bœufs', detail: 'Registre, naissances, pesées' }
];

export function App() {
  const [enLigne, setEnLigne] = useState(navigator.onLine);

  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener('online', maj);
    window.addEventListener('offline', maj);
    return () => {
      window.removeEventListener('online', maj);
      window.removeEventListener('offline', maj);
    };
  }, []);

  return (
    <main>
      <header>
        <h1>Ferme360</h1>
        <span class={enLigne ? 'etat ok' : 'etat hors'}>
          {enLigne ? 'En ligne' : 'Hors ligne'}
        </span>
      </header>
      <p class="intro">Étape 1 : l'application est installée et fonctionne sans réseau.</p>
      <ul>
        {activites.map((a) => (
          <li key={a.nom}>
            <strong>{a.nom}</strong>
            <span>{a.detail}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
