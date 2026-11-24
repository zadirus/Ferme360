import { useEffect, useState } from 'preact/hooks';
import { countDirty, getMeta, setMeta, viderBase } from './db';
import { recharger } from './hooks';
import { api, saveSession, type User } from './session';

interface Props {
  onDone: (u: User) => void;
  reconnect?: boolean;
}

export function Auth({ onDone, reconnect }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [needsCode, setNeedsCode] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ configured: boolean; needsCode?: boolean }>('/api/status')
      .then((r) => {
        setConfigured(r.configured);
        setNeedsCode(r.needsCode !== false);
      })
      .catch(() => {
        setConfigured(true);
        setError('Pas de réseau : la première connexion demande internet.');
      });
  }, []);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const path = configured ? '/api/login' : '/api/setup';
      const body = configured ? { name, password } : { name, password, code: needsCode ? code : '' };
      const r = await api<{ token: string; user: User }>(path, body);
      // téléphone partagé : les données de la personne précédente sont retirées avant d'afficher celles de la nouvelle
      const dernier = await getMeta<string>('localUser');
      if (dernier && dernier.toLowerCase() !== r.user.name.toLowerCase()) {
        if ((await countDirty()) > 0) {
          setError(`Ce téléphone contient des saisies de ${dernier} pas encore envoyées. Reconnectez-vous d'abord avec ce compte pour les envoyer.`);
          return;
        }
        await viderBase();
        await recharger();
      }
      await setMeta('localUser', r.user.name);
      saveSession(r.token, r.user);
      onDone(r.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  if (configured === null) return <main class="contenu"><p class="intro">Chargement…</p></main>;

  return (
    <main class="contenu">
      <div class="accueil-auth">
        <span class="logo-grand" aria-hidden="true">🌾</span>
        <h2>Ferme360</h2>
      </div>
      <p class="intro">
        {configured
          ? reconnect
            ? 'Reconnectez-vous pour reprendre la synchronisation. Vos saisies sont conservées.'
            : 'Connectez-vous.'
          : 'Première installation : créez le compte du propriétaire.'}
      </p>
      <form onSubmit={submit}>
        {!configured && needsCode && (
          <label>
            Code d'installation
            <input value={code} onInput={(e) => setCode(e.currentTarget.value)} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck={false} required />
          </label>
        )}
        <label>
          Nom
          <input value={name} onInput={(e) => setName(e.currentTarget.value)} autocomplete="username" required />
        </label>
        <label>
          Mot de passe {!configured && '(8 caractères minimum)'}
          <input
            type="password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            autocomplete={configured ? 'current-password' : 'new-password'}
            minLength={configured ? 1 : 8}
            required
          />
        </label>
        {error && <p class="erreur">{error}</p>}
        {configured && <p class="intro">Un compte par personne, créé par le propriétaire. Mot de passe oublié ? Le propriétaire peut le changer dans Plus, Équipe. Après 5 erreurs, le compte est bloqué 5 minutes.</p>}
        <button class="principal" type="submit" disabled={busy}>
          {configured ? 'Se connecter' : "Créer l'installation"}
        </button>
      </form>
    </main>
  );
}
