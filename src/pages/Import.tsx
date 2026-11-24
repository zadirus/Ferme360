import { useState } from 'preact/hooks';
import { fmtInt, today } from '../format';
import { useItems } from '../hooks';
import { lireFichier } from '../import/lecture';
import { COLONNES, EXEMPLES, preparer, TITRE_IMPORT, type Existants, type ResultatImport, type TypeImport } from '../import/modeles';
import { MIME_XLSX, telecharger } from '../partage';
import { construireXlsx } from '../rapports/xlsx';
import type { Client, Article } from '../gestion/types';
import type { Bande } from '../poules/types';
import { useRuminants } from '../ruminants/donnees';
import { newId, saveMany } from '../sync';
import { Retour } from '../ui';

const CONSEILS: Record<TypeImport, string[]> = {
  animaux: ['Une ligne par animal. Obligatoires : Boucle, Espèce (mouton ou bœuf), Sexe (F ou M).', 'Naissance, race, robe, poids, lot, mère, père : facultatifs. Mère et père : écrivez leur numéro de boucle.', "Prix d'achat : pour mémoire, il sert au coût de revient. Il ne crée ni dépense ni sortie d'argent."],
  clients: ['Une ligne par client. Obligatoire : Nom.', "Solde dû : ce que le client vous doit aujourd'hui. Il devient une créance de départ, sans compter comme vente."],
  stock: ['Une ligne par article. Obligatoires : Article, Unité (sac, flacon…), Quantité.', "Péremption pour les médicaments. Poids d'une unité : 50 pour un sac de 50 kg."],
  bandes: ["Une ligne par bande. Obligatoires : Nom, Effectif (nombre de poules aujourd'hui).", "L'effectif indiqué devient l'effectif de départ : l'historique des mortalités n'est pas repris."]
};

export function Import() {
  const r = useRuminants();
  const clients = useItems<Client>('client');
  const articles = useItems<Article>('article');
  const bandes = useItems<Bande>('bande');
  const [type, setType] = useState<TypeImport>('animaux');
  const [res, setRes] = useState<ResultatImport | null>(null);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const existants: Existants = {
    animaux: r.animaux.map((a) => ({ id: a.id, boucle: a.boucle, espece: a.espece })),
    lots: r.lots.map((l) => ({ id: l.id, nom: l.nom, espece: l.espece })),
    clients, articles, bandes
  };

  const modele = () => {
    const doc = construireXlsx([
      { nom: 'Données', colonnes: COLONNES[type], lignes: EXEMPLES[type] },
      { nom: "Mode d'emploi", colonnes: ['Conseils'], lignes: [...CONSEILS[type].map((c) => [c]), ['Effacez les lignes « Exemple » avant de remplir avec vos vraies données.']] }
    ]);
    telecharger(doc, `modele-${type}.xlsx`, MIME_XLSX);
  };

  async function choisir(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setErreur(''); setMessage(''); setRes(null);
    try {
      const lignes = await lireFichier(f);
      if (lignes.length < 2) return setErreur('Le fichier est vide : il faut une ligne de titres puis vos données.');
      setRes(preparer(type, lignes, existants, today(), newId));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Fichier illisible.');
    }
  }

  const valides = res?.lignes.filter((l) => !l.erreurs.length) ?? [];
  const refusees = res?.lignes.filter((l) => l.erreurs.length) ?? [];

  async function importer() {
    if (!res || !valides.length) return;
    setOccupe(true);
    try {
      await saveMany([...res.communs, ...valides.flatMap((l) => l.enregs)]);
      setMessage(`${valides.length} ligne(s) importée(s). Elles partent maintenant vers vos autres téléphones.`);
      setRes(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Reprendre mes données</h2>
      <p class="intro">Vous avez déjà vos animaux, clients ou stocks dans un cahier ou un fichier Excel ? Remplissez le modèle, choisissez-le ici : tout est vérifié ligne par ligne avant d'être ajouté, et rien n'est modifié si vous ne confirmez pas.</p>
      <div class="puces">
        {(Object.keys(TITRE_IMPORT) as TypeImport[]).map((t) => (
          <button key={t} type="button" class={t === type ? 'actif' : ''} onClick={() => { setType(t); setRes(null); setMessage(''); setErreur(''); }}>{TITRE_IMPORT[t]}</button>
        ))}
      </div>
      <ul>{CONSEILS[type].map((c) => <li key={c}><small>{c}</small></li>)}</ul>
      {message && <p class="succes" role="status">{message}</p>}
      {erreur && <p class="erreur">{erreur}</p>}
      <div class="actions">
        <button class="secondaire" type="button" onClick={modele}>1. Télécharger le modèle Excel</button>
        <label class="fichier">2. Choisir mon fichier<input type="file" accept=".xlsx,.csv,text/csv" onChange={(e) => void choisir(e)} /></label>
      </div>
      {res && (
        <>
          <h3>Vérification</h3>
          <div class="stats">
            <div class="stat"><strong>{fmtInt(valides.length)}</strong><span>ligne(s) prêtes à importer</span></div>
            <div class="stat"><strong class={refusees.length ? 'dette' : ''}>{fmtInt(refusees.length)}</strong><span>ligne(s) refusées</span></div>
          </div>
          {refusees.length > 0 && (
            <ul>
              {refusees.slice(0, 15).map((l) => (
                <li key={l.numero}><strong>Ligne {l.numero} : {l.resume}</strong>{l.erreurs.map((e) => <small key={e} class="dette">{e}</small>)}</li>
              ))}
              {refusees.length > 15 && <li class="vide">… et {refusees.length - 15} autre(s). Corrigez le fichier et recommencez.</li>}
            </ul>
          )}
          {valides.some((l) => l.avertissements.length) && (
            <ul>{valides.filter((l) => l.avertissements.length).slice(0, 5).map((l) => <li key={l.numero}><strong>Ligne {l.numero}</strong>{l.avertissements.map((a) => <small key={a}>{a}</small>)}</li>)}</ul>
          )}
          <ul>{valides.slice(0, 6).map((l) => <li key={l.numero}><small>Ligne {l.numero} : {l.resume}</small></li>)}{valides.length > 6 && <li class="vide">… et {valides.length - 6} autre(s)</li>}</ul>
          <button class="principal" type="button" disabled={occupe || !valides.length} onClick={() => void importer()}>
            {refusees.length ? `Importer les ${valides.length} lignes valides` : `Importer ${valides.length} ligne(s)`}
          </button>
          {refusees.length > 0 && <p class="intro">Les lignes refusées ne sont pas importées. Vous pouvez corriger le fichier et le rechoisir : les lignes déjà importées seront alors signalées comme existantes.</p>}
        </>
      )}
    </section>
  );
}
