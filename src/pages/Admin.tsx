import { useEffect, useState } from 'preact/hooks';
import { NOM_ROLE, peut, peutToutSupprimer, ROLES_CREABLES, type Role } from '../droits';
import { fmtDate } from '../format';
import { useRole } from '../hooks';
import { LIBELLE_COLLECTION } from '../libelles';
import { api, deconnexion, getUser } from '../session';
import { getState } from '../sync';
import { Boutons, Champ, Choix, Retour } from '../ui';

const dateHeure = (t: number) => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Plus() {
  const role = useRole();
  const user = getUser();
  const lien = (href: string, icone: string, titre: string, detail: string) => (
    <li key={href}>
      <a class="carte" href={`#${href}`}>
        <strong>{icone} {titre}</strong>
        <span>{detail}</span>
      </a>
    </li>
  );
  return (
    <section>
      <h2>Plus</h2>
      <p class="intro">{user?.name} · {NOM_ROLE[role as Role] ?? role}</p>
      <ul>
        {role !== 'ouvrier' && lien('/tableau', '📊', 'Tableau de bord', 'Chiffres clés et graphiques de toute la ferme')}
        {peut(role, 'argent') && lien('/argent', '💰', 'Argent', 'Caisse, Mobile Money, dettes, dépenses, résultats')}
        {peut(role, 'rapports') && lien('/rapports', '📄', 'Rapports', 'Mois par mois, en PDF ou Excel, à partager')}
        {lien('/carnet', '📒', 'Carnet', 'Vos notes')}
        {peut(role, 'reglages') && lien('/reglages', '⚙️', 'Réglages', "Seuils d'alerte et valeurs par défaut")}
        {peut(role, 'equipe') && lien('/equipe', '👥', 'Équipe', 'Créer les comptes et choisir les droits')}
        {peut(role, 'journal') && lien('/journal', '🕑', 'Journal des modifications', 'Qui a modifié ou supprimé quoi')}
        {peutToutSupprimer(role) && lien('/corbeille', '🗑️', 'Corbeille', 'Retrouver et restaurer ce qui a été supprimé')}
        {peut(role, 'sauvegarde') && lien('/import', '📥', 'Reprendre mes données', 'Importer animaux, clients, stock, bandes depuis Excel')}
        {peut(role, 'sauvegarde') && lien('/sauvegarde', '💾', 'Sauvegarde', 'Exporter ou restaurer toutes les données')}
        {lien('/aide', '❓', 'Aide', 'Mode d’emploi, par où commencer')}
        {lien('/notifications', '🔔', 'Notifications', 'Le résumé du matin sur ce téléphone')}
        {lien('/pin', '🔒', 'Code PIN', 'Verrouiller l’application sur ce téléphone')}
        {lien('/mdp', '🔑', 'Mon mot de passe', 'Le changer')}
      </ul>
      <button
        class="secondaire"
        type="button"
        onClick={() => {
          const n = getState().pending;
          const msg = n ? `${n} saisie(s) n'ont pas encore été envoyées. Elles restent sur ce téléphone et partiront à la prochaine connexion. Se déconnecter ?` : 'Se déconnecter ?';
          if (!window.confirm(msg)) return;
          deconnexion();
          location.hash = '/';
          location.reload();
        }}
      >
        Se déconnecter
      </button>
    </section>
  );
}

export function MotDePasse() {
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    try {
      await api('/api/password', { ancien, nouveau });
      setMessage('Mot de passe changé.');
      setAncien('');
      setNouveau('');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }
  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Mon mot de passe</h2>
      {message && <p class="succes" role="status">{message}</p>}
      <form class="formulaire" onSubmit={envoyer}>
        <label>Mot de passe actuel<input type="password" value={ancien} onInput={(e) => setAncien(e.currentTarget.value)} autocomplete="current-password" required /></label>
        <label>Nouveau mot de passe (8 caractères minimum)<input type="password" value={nouveau} onInput={(e) => setNouveau(e.currentTarget.value)} autocomplete="new-password" minLength={8} required /></label>
        {erreur && <p class="erreur">{erreur}</p>}
        <Boutons texte="Changer" />
      </form>
    </section>
  );
}

interface Compte { id: string; name: string; role: string; active: boolean; createdAt: number }

export function Equipe() {
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [creation, setCreation] = useState(false);
  const [reset, setReset] = useState<string | null>(null);
  const [renomme, setRenomme] = useState<string | null>(null);

  const charger = async () => {
    try {
      const u = (await api<{ users: Compte[] }>('/api/users')).users;
      if (u.length > 1) localStorage.setItem('ferme360.equipe', '1');
      setComptes(u);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Cette page demande une connexion internet.');
    }
  };
  useEffect(() => void charger(), []);

  const agir = async (corps: object, ok: string) => {
    try {
      await api('/api/users/update', corps);
      setMessage(ok);
      setReset(null);
      setRenomme(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    }
  };

  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Équipe</h2>
      <p class="intro">Chacun se connecte avec son nom et son mot de passe, et ne voit que ce que son profil permet. Les données interdites ne sont jamais envoyées sur son téléphone.</p>
      {message && <p class="succes" role="status">{message}</p>}
      {erreur && <p class="erreur">{erreur}</p>}
      {!creation && <button class="principal" type="button" onClick={() => setCreation(true)}>+ Ajouter un compte</button>}
      {creation && <NouveauCompte onFini={async (m) => { setCreation(false); if (m) setMessage(m); await charger(); }} />}
      <ul>
        {(comptes ?? []).map((c) => (
          <li key={c.id}>
            <div class="ligne">
              <strong>{c.name}</strong>
              <span class={`badge ${c.active ? '' : 'rouge'}`}>{c.active ? NOM_ROLE[c.role as Role] ?? c.role : 'Désactivé'}</span>
            </div>
            <small>Créé le {fmtDate(new Date(c.createdAt).toISOString().slice(0, 10))}</small>
            {c.role !== 'owner' && (
              <>
                <Choix label="Profil" value={c.role as Role} onChange={(r) => void agir({ id: c.id, role: r }, 'Profil modifié')} options={ROLES_CREABLES} />
                <button type="button" class="lien" onClick={() => void agir({ id: c.id, active: !c.active }, c.active ? 'Compte désactivé' : 'Compte réactivé')}>
                  {c.active ? 'Désactiver ce compte' : 'Réactiver ce compte'}
                </button>
                <button type="button" class="lien" onClick={() => { setRenomme(renomme === c.id ? null : c.id); setReset(null); }}>Changer son nom</button>
                {renomme === c.id && <NomForm depart={c.name} onValider={(n) => agir({ id: c.id, name: n }, 'Nom modifié')} />}
                <button type="button" class="lien" onClick={() => { setReset(reset === c.id ? null : c.id); setRenomme(null); }}>Changer son mot de passe</button>
                {reset === c.id && <ResetForm onValider={(p) => agir({ id: c.id, password: p }, 'Mot de passe changé')} />}
              </>
            )}
          </li>
        ))}
        {comptes === null && !erreur && <li class="vide">Chargement…</li>}
      </ul>
      <p class="intro">Un compte désactivé est coupé tout de suite. Les données déjà présentes sur son téléphone y restent : récupérez le téléphone si nécessaire.</p>
    </section>
  );
}

function NomForm({ depart, onValider }: { depart: string; onValider: (n: string) => Promise<void> }) {
  const [n, setN] = useState(depart);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void onValider(n); }}>
      <label>Nouveau nom<input value={n} onInput={(e) => setN(e.currentTarget.value)} minLength={2} required /></label>
      <button class="secondaire" type="submit">Enregistrer ce nom</button>
    </form>
  );
}

function ResetForm({ onValider }: { onValider: (p: string) => Promise<void> }) {
  const [p, setP] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); void onValider(p); }}>
      <label>Nouveau mot de passe (8 caractères minimum)<input value={p} onInput={(e) => setP(e.currentTarget.value)} minLength={8} required /></label>
      <button class="secondaire" type="submit">Enregistrer ce mot de passe</button>
    </form>
  );
}

function NouveauCompte({ onFini }: { onFini: (m: string) => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('ouvrier');
  const [erreur, setErreur] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    try {
      await api('/api/users', { name, password, role });
      onFini(`Compte de ${name} créé. Donnez-lui son nom et son mot de passe.`);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }
  const aide: Record<string, string> = {
    gerant: 'Voit et saisit tout, y compris l’argent. Ne gère pas les comptes.',
    ouvrier: 'Saisit ramassages, mortalités, aliment, pesées, naissances. Ne voit ni ventes, ni argent, ni coûts.',
    veterinaire: 'Saisit soins, vaccins et diagnostics. Ne voit ni ventes, ni argent.'
  };
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Nouveau compte</h3>
      <Champ label="Nom" value={name} onChange={setName} required />
      <label>Mot de passe de départ (8 caractères minimum)<input value={password} onInput={(e) => setPassword(e.currentTarget.value)} minLength={8} required /></label>
      <Choix label="Profil" value={role} onChange={setRole} options={ROLES_CREABLES} />
      <p class="intro">{aide[role]}</p>
      {erreur && <p class="erreur">{erreur}</p>}
      <Boutons texte="Créer le compte" onAnnuler={() => onFini('')} />
    </form>
  );
}

interface Entree { id: number; recordId: string; collection: string; action: string; author: string; at: number; avant: Record<string, unknown> | null }

export function Journal() {
  const [entrees, setEntrees] = useState<Entree[] | null>(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    api<{ entrees: Entree[] }>('/api/journal?limite=100')
      .then((r) => setEntrees(r.entrees))
      .catch((e) => setErreur(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Cette page demande une connexion internet.'));
  }, []);
  const resume = (a: Record<string, unknown> | null) =>
    a ? Object.entries(a).filter(([k, v]) => typeof v !== 'object' && v !== '' && !k.endsWith('Id')).slice(0, 8).map(([k, v]) => `${k} : ${String(v)}`).join(' · ') : 'valeur d’avant illisible';
  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Journal des modifications</h2>
      <p class="intro">Chaque modification ou suppression garde son auteur, sa date et la valeur d'avant. Conservé 24 mois.</p>
      {erreur && <p class="erreur">{erreur}</p>}
      <ul>
        {(entrees ?? []).map((e) => (
          <li key={e.id}>
            <div class="ligne"><strong>{LIBELLE_COLLECTION[e.collection] ?? e.collection}</strong><span class={`badge ${e.action === 'suppression' ? 'rouge' : 'ambre'}`}>{e.action === 'suppression' ? 'Supprimé' : 'Modifié'}</span></div>
            <small>par {e.author} · {dateHeure(e.at)}</small>
            <details><summary>Valeur d'avant</summary><small>{resume(e.avant)}</small></details>
          </li>
        ))}
        {entrees && entrees.length === 0 && <li class="vide">Aucune modification pour l'instant.</li>}
        {entrees === null && !erreur && <li class="vide">Chargement…</li>}
      </ul>
    </section>
  );
}
