import { useState } from 'preact/hooks';
import { fmtDate, today } from '../format';
import { useItems } from '../hooks';
import { MIME_PDF, MIME_XLSX, partager, telecharger } from '../partage';
import { construirePdf } from '../rapports/pdf';
import { construireRapport, libelleMois, versFeuilles, type DonneesRapport } from '../rapports/rapport';
import { construireXlsx } from '../rapports/xlsx';
import { Retour } from '../ui';

export function Rapports() {
  const d: DonneesRapport = {
    ventes: useItems('vente'), paiements: useItems('paiement'), clients: useItems('client'), achats: useItems('achat'), depenses: useItems('depense'),
    reglements: useItems('reglement'), fournisseurs: useItems('fournisseur'), ajustements: useItems('treso_mvt'), bandes: useItems('bande'),
    ramassages: useItems('ramassage'), mortalites: useItems('mortalite'), mvtsOeufs: useItems('oeufs_mvt'), animaux: useItems('animal'),
    mvtsAnimaux: useItems('mvt_animal'), misesBas: useItems('misebas')
  };
  const [mois, setMois] = useState(today().slice(0, 7));
  const [message, setMessage] = useState('');
  const doc = construireRapport(mois, d, today());
  const base = `ferme360-rapport-${mois}`;

  const pdf = () => construirePdf(doc);
  const xlsx = () => construireXlsx(versFeuilles(doc));
  const dit = (r: 'partage' | 'telecharge') => setMessage(r === 'partage' ? 'Fichier prêt à partager.' : 'Fichier téléchargé : cherchez-le dans les téléchargements du téléphone.');

  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Rapports</h2>
      <label>Mois<input type="month" value={mois} max={today().slice(0, 7)} onInput={(e) => e.currentTarget.value && setMois(e.currentTarget.value)} /></label>
      {message && <p class="succes" role="status">{message}</p>}
      <div class="actions">
        <button class="principal" type="button" onClick={async () => dit(await partager(pdf(), `${base}.pdf`, MIME_PDF, `Rapport Ferme360 - ${libelleMois(mois)}`))}><span class="e">📄</span>Partager en PDF</button>
        <button class="principal" type="button" onClick={async () => dit(await partager(xlsx(), `${base}.xlsx`, MIME_XLSX, `Rapport Ferme360 - ${libelleMois(mois)}`))}><span class="e">📗</span>Partager en Excel</button>
        <button class="secondaire" type="button" onClick={() => { telecharger(pdf(), `${base}.pdf`, MIME_PDF); dit('telecharge'); }}>Télécharger le PDF</button>
        <button class="secondaire" type="button" onClick={() => { telecharger(xlsx(), `${base}.xlsx`, MIME_XLSX); dit('telecharge'); }}>Télécharger l'Excel</button>
      </div>
      <p class="intro">Le bouton « Partager » ouvre la liste de votre téléphone : choisissez WhatsApp, e-mail, Drive…</p>
      <h3>{doc.titre}</h3>
      <p class="intro">{doc.sousTitre}</p>
      {doc.sections.map((s) => (
        <div key={s.titre}>
          <h3>{s.titre}</h3>
          <ul>
            {s.lignes.length === 0 && <li class="vide">Rien ce mois-ci.</li>}
            {s.lignes.slice(0, 12).map((l, i) => (
              <li key={i}>
                <div class="ligne"><strong>{String(l[0])}</strong><span class="montant">{l.slice(1).map((v) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : v)).join(' · ')}</span></div>
              </li>
            ))}
            {s.lignes.length > 12 && <li class="vide">… et {s.lignes.length - 12} autre(s) ligne(s) dans le PDF et l'Excel.</li>}
          </ul>
        </div>
      ))}
      <p class="intro">Rapport du {fmtDate(`${mois}-01`)} au dernier jour du mois.</p>
    </section>
  );
}
