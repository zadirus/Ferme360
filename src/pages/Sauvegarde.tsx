import { useState } from 'preact/hooks';
import { exporterTout, getRecord, putRecord, reinitialiserDonnees } from '../db';
import { peut, peutEcrire } from '../droits';
import { useRole } from '../hooks';
import { construireXlsx } from '../rapports/xlsx';
import { feuillesDonnees } from '../rapports/exportTout';
import { api } from '../session';
import { fmtDate, today } from '../format';
import { MIME_JSON, MIME_XLSX, partager, telecharger } from '../partage';
import { getUser } from '../session';
import { notifyData, refreshPending, syncNow } from '../sync';
import { Retour } from '../ui';

interface Fichier {
  format: string;
  version: number;
  date: string;
  records: Array<{ id: string; collection: string; data: Record<string, unknown>; updatedAt: number; author?: string }>;
}

function RemiseAZero() {
  const [garder, setGarder] = useState(true);
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState(false);
  async function lancer() {
    setErreur('');
    if (!window.confirm("DERNIÈRE QUESTION : toutes les données de la ferme vont être effacées sur le serveur et sur tous les téléphones. Avez-vous exporté une sauvegarde ?")) return;
    try {
      const r = await api<{ epoch: string }>('/api/reset', { confirmation: 'REMETTRE A ZERO', garderReglages: garder });
      await reinitialiserDonnees(r.epoch);
      for (const k of ['ferme360.premiers', 'ferme360.sauvegarde', 'ferme360.equipe']) localStorage.removeItem(k);
      await notifyData();
      void syncNow();
      setFait(true);
      setTexte('');
    } catch (e) {
      setErreur(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Il faut une connexion internet pour remettre la ferme à zéro.');
    }
  }
  return (
    <>
      <h3>Remettre la ferme à zéro</h3>
      <div class="danger">
        <p>Efface <strong>toutes les données</strong> : animaux, bandes, ventes, clients, stocks, argent, notes, journal. Sur le serveur <strong>et sur tous les téléphones</strong> (chacun se vide à sa prochaine connexion). Les comptes de l'équipe sont conservés.</p>
        <p>À utiliser pour repartir de zéro après vos essais. <strong>Exportez d'abord une sauvegarde ci-dessus.</strong> Cloudflare garde en plus l'historique de la base pendant 7 jours (30 en formule payante) : en cas d'erreur, on peut encore revenir en arrière.</p>
        <label class="case"><input type="checkbox" checked={garder} onChange={() => setGarder(!garder)} />Garder mes réglages (seuils, programme de vaccination, courbe de ponte)</label>
        <label>Pour confirmer, tapez : REMETTRE A ZERO<input value={texte} onInput={(e) => setTexte(e.currentTarget.value)} autocomplete="off" autocapitalize="characters" /></label>
        {erreur && <p class="erreur">{erreur}</p>}
        {fait && <p class="succes" role="status">La ferme est remise à zéro. Vous pouvez saisir vos vraies données.</p>}
        <button type="button" class="alerte-btn" disabled={texte.trim().toUpperCase() !== 'REMETTRE A ZERO'} onClick={() => void lancer()}>Effacer toutes les données</button>
      </div>
    </>
  );
}

export function Sauvegarde() {
  const role = useRole();
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  async function contenu(): Promise<{ octets: Uint8Array; nom: string; n: number }> {
    const records = await exporterTout();
    const f: Fichier = {
      format: 'ferme360-sauvegarde', version: 1, date: new Date().toISOString(),
      records: records.map((r) => ({ id: r.id, collection: r.collection, data: r.data, updatedAt: r.updatedAt, author: r.author }))
    };
    return { octets: new TextEncoder().encode(JSON.stringify(f)), nom: `ferme360-sauvegarde-${today()}.json`, n: records.length };
  }

  async function exporter(partage: boolean) {
    setErreur('');
    const { octets, nom, n } = await contenu();
    if (partage) await partager(octets, nom, MIME_JSON, `Sauvegarde Ferme360 du ${fmtDate(today())}`);
    else telecharger(octets, nom, MIME_JSON);
    localStorage.setItem('ferme360.sauvegarde', '1');
    setMessage(`Sauvegarde créée : ${n} enregistrements. Gardez ce fichier en lieu sûr (Google Drive, e-mail…).`);
  }

  async function excel(partage: boolean) {
    setErreur('');
    const recs = await exporterTout();
    const octets = construireXlsx(feuillesDonnees(recs.map((r) => ({ id: r.id, collection: r.collection, data: r.data, updatedAt: r.updatedAt, author: r.author }))));
    const nom = `ferme360-donnees-${today()}.xlsx`;
    if (partage) await partager(octets, nom, MIME_XLSX, `Données Ferme360 du ${fmtDate(today())}`);
    else telecharger(octets, nom, MIME_XLSX);
    setMessage(`Fichier Excel créé : ${recs.length} enregistrements, une feuille par type de données.`);
  }

  async function restaurer(e: Event) {
    setErreur('');
    setMessage('');
    const input = e.currentTarget as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier) return;
    let f: Fichier;
    try {
      f = JSON.parse(await fichier.text());
    } catch {
      return setErreur("Ce fichier n'est pas une sauvegarde Ferme360.");
    }
    if (f.format !== 'ferme360-sauvegarde' || !Array.isArray(f.records)) return setErreur("Ce fichier n'est pas une sauvegarde Ferme360.");
    const role = getUser()?.role ?? '';
    const valides = f.records.filter((r) => r && typeof r.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(r.id) && typeof r.collection === 'string' && /^[a-z_]{1,40}$/.test(r.collection) && r.data && typeof r.updatedAt === 'number' && peutEcrire(role, r.collection));
    if (!valides.length) return setErreur('Aucun enregistrement utilisable dans ce fichier.');
    if (!window.confirm(`Restaurer la sauvegarde du ${fmtDate(String(f.date).slice(0, 10))} (${valides.length} enregistrements) ? Ce qui manque est ajouté ; ce qui a été modifié depuis est conservé.`)) return;
    let ajoutes = 0;
    for (const r of valides) {
      const local = await getRecord(r.id);
      if (local && local.updatedAt >= r.updatedAt) continue;
      await putRecord({ id: r.id, collection: r.collection, data: r.data, updatedAt: r.updatedAt, deleted: false, author: r.author ?? '', dirty: 1 });
      ajoutes++;
    }
    await refreshPending();
    await notifyData();
    void syncNow();
    setMessage(`Restauration terminée : ${ajoutes} enregistrement(s) ajouté(s) ou remis à jour, ${valides.length - ajoutes} déjà à jour.`);
  }

  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Sauvegarde</h2>
      <h3>Comment vos données sont protégées</h3>
      <ul>
        <li><strong>Sur chaque téléphone</strong><small>une copie complète de ce que son profil peut voir. Perdre un téléphone ne perd rien : se reconnecter sur un autre suffit.</small></li>
        <li><strong>Chez Cloudflare</strong><small>la base de données garde automatiquement son historique et peut être remise dans son état d'une minute précise : 7 jours en formule gratuite, 30 jours en formule payante.</small></li>
        <li><strong>Votre fichier de sauvegarde</strong><small>à faire de temps en temps (chaque mois, par exemple) et à garder ailleurs, par exemple sur Google Drive ou par e-mail.</small></li>
      </ul>
      {message && <p class="succes" role="status">{message}</p>}
      {erreur && <p class="erreur">{erreur}</p>}
      <h3>Exporter</h3>
      <div class="actions">
        <button class="principal" type="button" onClick={() => void exporter(true)}><span class="e">📤</span>Partager la sauvegarde</button>
        <button class="secondaire" type="button" onClick={() => void exporter(false)}>Télécharger le fichier</button>
      </div>
      <h3>Consulter toutes mes données dans Excel</h3>
      <p class="intro">Un seul fichier Excel avec une feuille par type de données (animaux, ventes, clients, stocks…), noms à la place des codes. Pour lire, trier ou filtrer comme vous voulez.</p>
      <div class="actions">
        <button class="principal" type="button" onClick={() => void excel(true)}><span class="e">📗</span>Partager en Excel</button>
        <button class="secondaire" type="button" onClick={() => void excel(false)}>Télécharger l'Excel</button>
      </div>
      <h3>Restaurer</h3>
      <p class="intro">Choisissez un fichier de sauvegarde. Rien n'est effacé : les enregistrements manquants sont remis, et ce qui a été modifié depuis la sauvegarde est conservé.</p>
      <label class="fichier">
        Choisir un fichier de sauvegarde
        <input type="file" accept=".json,application/json" onChange={(e) => void restaurer(e)} />
      </label>
      {peut(role, 'equipe') && <RemiseAZero />}
    </section>
  );
}
