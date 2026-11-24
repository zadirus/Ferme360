import { useEffect, useState } from 'preact/hooks';
import { api, saveSession, type User } from './session';

interface Props {
  onDone: (u: User) => void;
  reconnect?: boolean;
}

export function Auth({ onDone, reconnect }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ configured: boolean }>('/api/status')
      .then((r) => setConfigured(r.configured))
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
      const body = configured ? { name, password } : { name, password, code };
      const r = await api<{ token: string; user: User }>(path, body);
      saveSession(r.token, r.user);
      onDone(r.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  if (configured === null) return <main><p>Chargement…</p></main>;

  return (
    <main>
      <header>
        <h1>Ferme360</h1>
      </header>
      <p class="intro">
        {configured
          ? reconnect
            ? 'Reconnectez-vous pour reprendre la synchronisation. Vos saisies sont conservées.'
            : 'Connectez-vous.'
          : 'Première installation : créez le compte du propriétaire.'}
      </p>
      <form onSubmit={submit}>
        {!configured && (
          <label>
            Code d'installation
            <input value={code} onInput={(e) => setCode(e.currentTarget.value)} autocomplete="off" required />
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
        <button class="principal" type="submit" disabled={busy}>
          {configured ? 'Se connecter' : "Créer l'installation"}
        </button>
      </form>
    </main>
  );
}
