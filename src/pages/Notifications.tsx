import { useEffect, useState } from 'preact/hooks';
import { CATEGORIES_ROLE, NOM_CATEGORIE, type CategorieNotif } from '../alertes';
import type { Role } from '../droits';
import { useRole } from '../hooks';
import { activerPush, desactiverPush, envoyerTest, etatPush, majPrefs, type EtatPush } from '../push';
import { Retour } from '../ui';

const CLE = 'ferme360.notif.prefs';

export function Notifications() {
  const role = useRole() as Role;
  const permises = CATEGORIES_ROLE[role] ?? [];
  const [etat, setEtat] = useState<EtatPush | null>(null);
  const [prefs, setPrefs] = useState<CategorieNotif[]>(() => {
    try {
      const p = JSON.parse(localStorage.getItem(CLE) ?? 'null') as CategorieNotif[] | null;
      return p ? p.filter((c) => permises.includes(c)) : permises;
    } catch {
      return permises;
    }
  });
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const charger = () => etatPush().then(setEtat);
  useEffect(() => void charger(), []);

  const agir = async (f: () => Promise<void>, ok: string) => {
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      await f();
      setMessage(ok);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setOccupe(false);
      await charger();
    }
  };

  const bascule = async (c: CategorieNotif) => {
    const n = prefs.includes(c) ? prefs.filter((x) => x !== c) : [...prefs, c];
    setPrefs(n);
    localStorage.setItem(CLE, JSON.stringify(n));
    if (etat?.abonne) await majPrefs(n).catch(() => setErreur('Réglage non enregistré : pas de connexion.'));
  };

  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Notifications</h2>
      <p class="intro">Chaque matin, un seul message regroupe ce qui demande votre attention : rappels de santé, mises bas, délais d'attente qui se terminent, stocks, créances, poules. Il arrive même application fermée. L'heure se règle dans « Réglages ».</p>
      {message && <p class="succes" role="status">{message}</p>}
      {erreur && <p class="erreur">{erreur}</p>}
      {etat && !etat.supporte && <p class="erreur">Ce navigateur ne gère pas les notifications. Utilisez Chrome sur Android, et ajoutez l'application à l'écran d'accueil (sur iPhone : iOS 16.4 minimum).</p>}
      {etat?.supporte && (
        <>
          <p class="intro">Sur ce téléphone : <strong>{etat.abonne ? 'activées' : etat.permission === 'denied' ? 'refusées par le navigateur' : 'désactivées'}</strong></p>
          <div class="actions">
            {!etat.abonne ? (
              <button class="principal" type="button" disabled={occupe} onClick={() => void agir(() => activerPush(prefs), 'Notifications activées sur ce téléphone.')}><span class="e">🔔</span>Activer</button>
            ) : (
              <>
                <button class="principal" type="button" disabled={occupe} onClick={() => void agir(async () => { const r = await envoyerTest(); if (!r.envoyes) throw new Error("Aucun message n'a pu partir. Réessayez dans un instant."); }, 'Message de test envoyé : il doit arriver dans quelques secondes.')}><span class="e">📨</span>Envoyer un test</button>
                <button class="secondaire" type="button" disabled={occupe} onClick={() => void agir(desactiverPush, 'Notifications désactivées sur ce téléphone.')}>Désactiver</button>
              </>
            )}
          </div>
          <h3>Ce que je veux recevoir</h3>
          <ul>
            {permises.map((c) => (
              <li key={c}>
                <label class="case"><input type="checkbox" checked={prefs.includes(c)} onChange={() => void bascule(c)} />{NOM_CATEGORIE[c]}</label>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Si les messages n'arrivent pas</h3>
      <ul>
        <li><small>Ajoutez l'application à l'écran d'accueil de Chrome et ouvrez-la depuis son icône.</small></li>
        <li><small>Sur Xiaomi, Tecno, Infinix, Samsung : dans les réglages du téléphone, retirez l'économie de batterie pour Chrome et pour Ferme360 (« Aucune restriction »), et autorisez le démarrage automatique.</small></li>
        <li><small>Les rappels restent toujours visibles sur l'accueil de l'application, même sans notification.</small></li>
      </ul>
    </section>
  );
}
