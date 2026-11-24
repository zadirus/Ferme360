import { useEffect, useState } from 'preact/hooks';
import { Auth } from './Auth';
import { Carnet } from './Carnet';
import { StatusBar } from './StatusBar';
import { useHash } from './hooks';
import { Accueil } from './pages/Accueil';
import { BandeDetail } from './pages/BandeDetail';
import { Oeufs } from './pages/Oeufs';
import { Poules } from './pages/Poules';
import { getState, resetNeedLogin, startAutoSync, subscribe } from './sync';
import { getToken, getUser, type User } from './session';

const ONGLETS: Array<[string, string, string]> = [
  ['/', 'Accueil', '/'],
  ['/poules', 'Poules', '/poules'],
  ['/oeufs', 'Œufs', '/oeufs'],
  ['/carnet', 'Carnet', '/carnet']
];

export function App() {
  const [user, setUser] = useState<User | null>(() => (getToken() ? getUser() : null));
  const [needLogin, setNeedLogin] = useState(false);
  const route = useHash();

  useEffect(() => subscribe(() => setNeedLogin(getState().needLogin)), []);
  useEffect(() => (user ? startAutoSync() : undefined), [user]);

  if (!user || needLogin) {
    return (
      <Auth
        reconnect={needLogin}
        onDone={(u) => {
          resetNeedLogin();
          setNeedLogin(false);
          setUser(u);
        }}
      />
    );
  }

  let page;
  if (route.startsWith('/poules/')) page = <BandeDetail id={route.slice('/poules/'.length)} />;
  else if (route === '/poules') page = <Poules />;
  else if (route === '/oeufs') page = <Oeufs />;
  else if (route === '/carnet') page = <Carnet />;
  else page = <Accueil />;

  const actif = (p: string) => (p === '/' ? route === '/' : route.startsWith(p));

  return (
    <main class="avec-nav">
      <header>
        <h1>Ferme360</h1>
        <span class="qui">{user.name}</span>
      </header>
      <StatusBar />
      {page}
      <nav class="onglets" aria-label="Navigation">
        {ONGLETS.map(([chemin, texte]) => (
          <a key={chemin} href={`#${chemin}`} class={actif(chemin) ? 'actif' : ''}>
            {texte}
          </a>
        ))}
      </nav>
    </main>
  );
}
