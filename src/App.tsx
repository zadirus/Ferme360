import { useEffect, useState } from 'preact/hooks';
import { Auth } from './Auth';
import { Carnet } from './Carnet';
import { StatusBar } from './StatusBar';
import { prechauffer, useHash, useItems, useRole } from './hooks';
import { peut } from './droits';
import { appliquerReglages, ID_REGLAGES, type Reglages as TypeReglages } from './reglages';
import { Equipe, Journal, MotDePasse, Plus } from './pages/Admin';
import { Rapports } from './pages/Rapports';
import { Reglages } from './pages/Reglages';
import { Sauvegarde } from './pages/Sauvegarde';
import { Accueil } from './pages/Accueil';
import { BandeDetail } from './pages/BandeDetail';
import { Oeufs } from './pages/Oeufs';
import { Poules } from './pages/Poules';
import { AnimalDetail } from './pages/Animal';
import { Elevage } from './pages/Elevage';
import { LotDetail } from './pages/Lot';
import { Ruminants } from './pages/Ruminants';
import { Argent } from './pages/Argent';
import { ArticleDetail, Stocks } from './pages/Stocks';
import { ClientDetail, Clients, NouvelleVente, Ventes } from './pages/Ventes';
import { getState, resetNeedLogin, setRole, startAutoSync, subscribe } from './sync';
import { getToken, getUser, type User } from './session';

const ONGLETS: Array<[string, string, string]> = [
  ['/', 'Accueil', '🏠'],
  ['/elevage', 'Élevage', '🐾'],
  ['/ventes', 'Ventes', '🧾'],
  ['/stocks', 'Stocks', '📦'],
  ['/argent', 'Argent', '💰']
];

// Accès aux pages selon le profil (le serveur applique de toute façon les mêmes droits)
function autorise(route: string, role: string): boolean {
  if (route.startsWith('/ventes') || route.startsWith('/clients') || route === '/argent') return peut(role, 'argent');
  if (route.startsWith('/stocks')) return peut(role, 'stocks');
  if (route === '/rapports') return peut(role, 'rapports');
  if (route === '/reglages') return peut(role, 'reglages');
  if (route === '/sauvegarde') return peut(role, 'sauvegarde');
  if (route === '/equipe') return peut(role, 'equipe');
  if (route === '/journal') return peut(role, 'journal');
  return true;
}

export function App() {
  const [user, setUser] = useState<User | null>(() => (getToken() ? getUser() : null));
  const [needLogin, setNeedLogin] = useState(false);
  const route = useHash();
  const roleSync = useRole();
  const reglages = useItems<Partial<TypeReglages>>('reglage').find((x) => x.id === ID_REGLAGES);
  appliquerReglages(reglages ?? {});
  const [pret, setPret] = useState(false);
  useEffect(() => void prechauffer().finally(() => setPret(true)), []);

  useEffect(() => subscribe(() => setNeedLogin(getState().needLogin)), []);
  useEffect(() => (user ? startAutoSync() : undefined), [user]);

  if (!user || needLogin) {
    return (
      <Auth
        reconnect={needLogin}
        onDone={(u) => {
          resetNeedLogin();
          setNeedLogin(false);
          setRole(u.role);
          setUser(u);
        }}
      />
    );
  }

  if (!pret) return <main class="contenu"><p class="intro">Chargement…</p></main>;

  const role = roleSync || user.role;

  let page;
  if (!autorise(route, role)) page = <section><h2>Accès non autorisé</h2><p class="intro">Votre profil n'a pas accès à cette page.</p><a class="retour" href="#/">← Accueil</a></section>;
  else if (route.startsWith('/poules/')) page = <BandeDetail id={route.slice('/poules/'.length)} />;
  else if (route.startsWith('/ventes/nouvelle')) page = <NouvelleVente key={route} clientInitial={route.split('/')[3] ?? ''} />;
  else if (route === '/ventes') page = <Ventes />;
  else if (route === '/clients') page = <Clients />;
  else if (route.startsWith('/clients/')) page = <ClientDetail id={route.slice('/clients/'.length)} />;
  else if (route === '/stocks') page = <Stocks />;
  else if (route.startsWith('/stocks/')) page = <ArticleDetail id={route.slice('/stocks/'.length)} />;
  else if (route === '/argent') page = <Argent />;
  else if (route === '/poules') page = <Poules />;
  else if (route === '/elevage') page = <Elevage />;
  else if (route === '/moutons') page = <Ruminants espece="ovin" />;
  else if (route === '/boeufs') page = <Ruminants espece="bovin" />;
  else if (route.startsWith('/animaux/')) page = <AnimalDetail key={route} id={route.slice('/animaux/'.length)} />;
  else if (route.startsWith('/lots/')) page = <LotDetail key={route} id={route.slice('/lots/'.length)} />;
  else if (route === '/oeufs') page = <Oeufs />;
  else if (route === '/carnet') page = <Carnet />;
  else if (route === '/plus') page = <Plus />;
  else if (route === '/equipe') page = <Equipe />;
  else if (route === '/journal') page = <Journal />;
  else if (route === '/reglages') page = <Reglages />;
  else if (route === '/sauvegarde') page = <Sauvegarde />;
  else if (route === '/rapports') page = <Rapports />;
  else if (route === '/mdp') page = <MotDePasse />;
  else page = <Accueil />;

  const actif = (p: string) =>
    p === '/' ? route === '/' : p === '/elevage' ? ['/elevage', '/poules', '/oeufs', '/moutons', '/boeufs', '/animaux', '/lots'].some((x) => route.startsWith(x)) : p === '/ventes' ? route.startsWith('/ventes') || route.startsWith('/clients') : route.startsWith(p);

  return (
    <>
      <header class="barre-haut">
        <div class="marque">
          <span class="logo" aria-hidden="true">🌾</span>
          Ferme360
        </div>
        <div class="droite">
          <StatusBar />
          <a class="avatar" href="#/plus" title={`${user.name} : menu`}>{user.name.trim().charAt(0).toUpperCase()}</a>
        </div>
      </header>
      <main class="contenu">{page}</main>
      <nav class="onglets" aria-label="Navigation">
        {ONGLETS.filter(([chemin]) => autorise(chemin, role)).map(([chemin, texte, icone]) => (
          <a key={chemin} href={`#${chemin}`} class={actif(chemin) ? 'actif' : ''}>
            <span class="i" aria-hidden="true">{icone}</span>
            {texte}
          </a>
        ))}
      </nav>
    </>
  );
}
