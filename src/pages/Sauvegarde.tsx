import { useState } from 'preact/hooks';
import { exporterTout, getRecord, putRecord } from '../db';
import { peutEcrire } from '../droits';
import { fmtDate, today } from '../format';
import { MIME_JSON, partager, telecharger } from '../partage';
import { getUser } from '../session';
import { notifyData, refreshPending, syncNow } from '../sync';
import { Retour } from '../ui';

interface Fichier {
  format: string;
  version: number;
  date: string;
  records: Array<{ id: string; collection: string; data: Record<string, unknown>; updatedAt: number; author?: string }>;
}

export function Sauvegarde() {
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
    setMessage(`Sauvegarde créée : ${n} enregistrements. Gardez ce fichier en lieu sûr (Google Drive, e-mail…).`);
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
      <h3>Restaurer</h3>
      <p class="intro">Choisissez un fichier de sauvegarde. Rien n'est effacé : les enregistrements manquants sont remis, et ce qui a été modifié depuis la sauvegarde est conservé.</p>
      <label class="fichier">
        Choisir un fichier de sauvegarde
        <input type="file" accept=".json,application/json" onChange={(e) => void restaurer(e)} />
      </label>
    </section>
  );
}
