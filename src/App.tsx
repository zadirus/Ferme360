import { useEffect, useState } from 'preact/hooks';
import { Auth } from './Auth';
import { Carnet } from './Carnet';
import { StatusBar } from './StatusBar';
import { prechauffer, useHash, useItems, useRole } from './hooks';
import { peut, peutToutSupprimer } from './droits';
import { appliquerReglages, ID_REGLAGES, type Reglages as TypeReglages } from './reglages';
import { Equipe, Journal, MotDePasse, Plus } from './pages/Admin';
import { Corbeille } from './pages/Corbeille';
import { Rapports } from './pages/Rapports';
import { Notifications } from './pages/Notifications';
import { Aide } from './pages/Aide';
import { Tableau } from './pages/Tableau';
import { Import } from './pages/Import';
import { Pin } from './pages/Pin';
import { pinDefini } from './pin';
import { Verrou } from './Verrou';
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
import { deconnexion, getToken, getUser, type User } from './session';

// Téléphone : barre du bas (5 entrées, « Plus » ouvre tout le reste)
const ONGLETS: Array<[string, string, string]> = [
  ['/', 'Accueil', '🏠'],
  ['/elevage', 'Élevage', '🐾'],
  ['/ventes', 'Ventes', '🧾'],
  ['/stocks', 'Stocks', '📦'],
  ['/plus', 'Plus', '☰']
];

// Ordinateur : menu latéral complet
const MENU_BUREAU: Array<{ section?: string; chemin: string; texte: string; icone: string }> = [
  { chemin: '/', texte: 'Accueil', icone: '🏠' },
  { chemin: '/tableau', texte: 'Tableau de bord', icone: '📊' },
  { section: 'Activités', chemin: '/elevage', texte: 'Élevage', icone: '🐾' },
  { chemin: '/ventes', texte: 'Ventes et clients', icone: '🧾' },
  { chemin: '/stocks', texte: 'Stocks', icone: '📦' },
  { chemin: '/argent', texte: 'Argent', icone: '💰' },
  { chemin: '/rapports', texte: 'Rapports', icone: '📄' },
  { section: 'Gestion', chemin: '/equipe', texte: 'Équipe et droits', icone: '👥' },
  { chemin: '/journal', texte: 'Journal', icone: '🕑' },
  { chemin: '/corbeille', texte: 'Corbeille', icone: '🗑️' },
  { chemin: '/reglages', texte: 'Réglages', icone: '⚙️' },
  { chemin: '/import', texte: 'Reprendre mes données', icone: '📥' },
  { chemin: '/sauvegarde', texte: 'Sauvegarde', icone: '💾' },
  { section: 'Moi', chemin: '/notifications', texte: 'Notifications', icone: '🔔' },
  { chemin: '/pin', texte: 'Code PIN', icone: '🔒' },
  { chemin: '/mdp', texte: 'Mon mot de passe', icone: '🔑' },
  { chemin: '/carnet', texte: 'Carnet', icone: '📒' },
  { chemin: '/aide', texte: 'Aide', icone: '❓' }
];

const FAMILLES: Record<string, string[]> = {
  '/elevage': ['/elevage', '/poules', '/oeufs', '/moutons', '/boeufs', '/animaux', '/lots'],
  '/ventes': ['/ventes', '/clients'],
  '/stocks': ['/stocks'],
  '/plus': ['/plus', '/argent', '/rapports', '/tableau', '/equipe', '/journal', '/corbeille', '/reglages', '/sauvegarde', '/import', '/notifications', '/pin', '/mdp', '/aide', '/carnet']
};

// Accès aux pages selon le profil (le serveur applique de toute façon les mêmes droits)
function autorise(route: string, role: string): boolean {
  if (route.startsWith('/ventes') || route.startsWith('/clients') || route === '/argent') return peut(role, 'argent');
  if (route.startsWith('/stocks')) return peut(role, 'stocks');
  if (route === '/rapports') return peut(role, 'rapports');
  if (route === '/reglages') return peut(role, 'reglages');
  if (route === '/sauvegarde' || route === '/import') return peut(role, 'sauvegarde');
  if (route === '/equipe') return peut(role, 'equipe');
  if (route === '/journal') return peut(role, 'journal');
  if (route === '/corbeille') return peutToutSupprimer(role);
  return true;
}

export function App() {
  const [user, setUser] = useState<User | null>(() => (getToken() ? getUser() : null));
  const [needLogin, setNeedLogin] = useState(false);
  const [verrouille, setVerrouille] = useState(() => pinDefini());
  const route = useHash();
  const roleSync = useRole();
  const reglages = useItems<Partial<TypeReglages>>('reglage').find((x) => x.id === ID_REGLAGES);
  appliquerReglages(reglages ?? {});
  const [pret, setPret] = useState(false);
  useEffect(() => void prechauffer().finally(() => setPret(true)), []);

  useEffect(() => subscribe(() => setNeedLogin(getState().needLogin)), []);
  useEffect(() => (user ? startAutoSync() : undefined), [user]);
  // le code PIN se redemande quand on revient sur l'application après 2 minutes
  useEffect(() => {
    let parti = 0;
    const f = () => {
      if (document.visibilityState === 'hidden') parti = Date.now();
      else if (parti && Date.now() - parti > 120_000 && pinDefini()) setVerrouille(true);
    };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

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

  if (verrouille && pinDefini()) return <Verrou onOuvert={() => setVerrouille(false)} />;

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
  else if (route === '/corbeille') page = <Corbeille />;
  else if (route === '/reglages') page = <Reglages />;
  else if (route === '/sauvegarde') page = <Sauvegarde />;
  else if (route === '/rapports') page = <Rapports />;
  else if (route === '/mdp') page = <MotDePasse />;
  else if (route === '/notifications') page = <Notifications />;
  else if (route === '/aide') page = <Aide />;
  else if (route === '/tableau') page = <Tableau />;
  else if (route === '/import') page = <Import />;
  else if (route === '/pin') page = <Pin />;
  else page = <Accueil />;

  const actif = (p: string) => (p === '/' ? route === '/' : (FAMILLES[p] ?? [p]).some((x) => route.startsWith(x)));
  const actifBureau = (p: string) => (p === '/' ? route === '/' : (FAMILLES[p] ?? [p]).some((x) => route.startsWith(x)));

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
      <nav class="menu-bureau" aria-label="Menu principal">
        {MENU_BUREAU.filter((m) => autorise(m.chemin, role)).map((m) => (
          <>
            {m.section && <p class="menu-section">{m.section}</p>}
            <a key={m.chemin} href={`#${m.chemin}`} class={actifBureau(m.chemin) ? 'actif' : ''}><span class="i" aria-hidden="true">{m.icone}</span>{m.texte}</a>
          </>
        ))}
        <p class="menu-section">{user.name}</p>
        <button type="button" class="deco" onClick={() => { if (window.confirm('Se déconnecter ?')) { deconnexion(); location.hash = '/'; location.reload(); } }}>⏻ Se déconnecter</button>
      </nav>
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
