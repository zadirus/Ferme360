import { useState } from 'preact/hooks';
import { Courbe } from '../courbe';
import { fmtDate, fmtDec, fmtFcfa, fmtInt, today } from '../format';
import { bilanBande, tauxPonteJour, datesRamassage } from '../poules/calculs';
import { ageSemaines, lireCourbe, tauxStandard, vaccinsAFaire, type LigneProphylaxie } from '../poules/programmes';
import type { Bande, Eau, Fientes, Mortalite, Ramassage, Sante } from '../poules/types';
import { newId, saveRecord } from '../sync';
import { Boutons, Champ, nombre, Stat } from '../ui';

type B = Bande & { id: string };

export function VaccinsAFaire({ bande, programme, santes, peutEnregistrer }: { bande: B; programme: LigneProphylaxie[]; santes: Sante[]; peutEnregistrer: boolean }) {
  const liste = vaccinsAFaire(bande, programme, santes, today(), 7);
  if (!liste.length) return null;
  const fait = (produit: string) =>
    saveRecord('sante', newId(), { bandeId: bande.id, date: today(), type: 'vaccin', produit, note: 'programme de vaccination', rappel: '' } satisfies Sante);
  return (
    <>
      <h3>Vaccins du programme</h3>
      <ul>
        {liste.map((v) => (
          <li key={v.produit}>
            <div class="ligne"><strong>{v.produit}</strong><span class={`badge ${v.retard ? 'rouge' : 'ambre'}`}>{v.retard ? `en retard (${fmtDate(v.date)})` : `le ${fmtDate(v.date)}`}</span></div>
            {peutEnregistrer && <button type="button" class="lien vert" onClick={() => void fait(v.produit)}>Fait aujourd'hui</button>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function CourbePonte({ bande, ram, morts, courbeTexte }: { bande: B; ram: Ramassage[]; morts: Mortalite[]; courbeTexte: string }) {
  const dates = datesRamassage(ram);
  if (dates.length < 2) return null;
  const mesure: Array<[number, number]> = dates.map((d) => [ageSemaines(bande, d), tauxPonteJour(bande, ram, morts, d) ?? 0] as [number, number]);
  const courbe = lireCourbe(courbeTexte);
  const min = mesure[0][0] - 3;
  const max = mesure[mesure.length - 1][0] + 3;
  const ref: Array<[number, number]> = [];
  for (let s = Math.max(0, Math.floor(min)); s <= Math.ceil(max); s++) {
    const t = tauxStandard(courbe, s);
    if (t !== null) ref.push([s, t]);
  }
  return (
    <>
      <h3>Courbe de ponte</h3>
      <Courbe titre="Taux de ponte selon l'âge de la bande" unite=" %" formatX={(x) => `${Math.round(x)} sem.`} series={[{ nom: bande.nom, points: mesure, couleur: '#2f6b3a' }, ...(ref.length > 1 ? [{ nom: 'Référence', points: ref, couleur: '#b3541e', pointille: true }] : [])]} />
      {!courbe.length && <p class="intro">Ajoutez une courbe de référence dans Plus, Réglages pour la comparer à votre bande.</p>}
    </>
  );
}

export function BilanBande({ bande, ram, morts, aliments, coutAliment, prixOeuf }: { bande: B; ram: Ramassage[]; morts: Mortalite[]; aliments: Array<{ kg: number }>; coutAliment: number; prixOeuf: number | null }) {
  const b = bilanBande(bande, ram, morts, aliments as never, coutAliment, prixOeuf);
  return (
    <>
      <h3>Bilan de la bande</h3>
      <div class="stats">
        <Stat valeur={fmtDec(b.plateauxBons, 1)} label="Plateaux de bons œufs" />
        <Stat valeur={b.coutPlateau !== null ? fmtFcfa(b.coutPlateau) : '—'} label="Coût de revient du plateau" />
        <Stat valeur={fmtFcfa(b.coutAchat + b.coutAliment)} label={`Coûts : achat ${fmtFcfa(b.coutAchat)} + aliment ${fmtFcfa(b.coutAliment)}`} />
        <Stat valeur={b.marge !== null ? fmtFcfa(b.marge) : '—'} label={b.marge !== null ? `Marge estimée (œufs valorisés à ${fmtDec((prixOeuf ?? 0) * 30, 0)} FCFA le plateau)` : "Marge : aucune vente d'œufs encore"} />
      </div>
      <p class="intro">Estimation : les œufs ne sont pas rattachés à une bande à la vente, ils sont valorisés au prix moyen de vente. Les autres charges (eau, électricité, main-d'œuvre) ne sont pas réparties.</p>
    </>
  );
}

export function EauForm({ bandeId, onFini }: { bandeId: string; onFini: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [litres, setLitres] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    const l = nombre(litres);
    if (l <= 0) return;
    await saveRecord('eau', newId(), { bandeId, date, litres: l } satisfies Eau);
    onFini('Eau enregistrée');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Eau consommée</h3>
      <Champ label="Quantité bue dans la journée" type="number" min={0} value={litres} onChange={setLitres} suffixe="litres" required />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

export function FientesForm({ bandeId, onFini }: { bandeId: string; onFini: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [sacs, setSacs] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    const n = nombre(sacs);
    if (n <= 0) return;
    await saveRecord('fientes', newId(), { bandeId, date, sacs: n } satisfies Fientes);
    onFini('Fientes enregistrées');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Fientes sorties du poulailler</h3>
      <Champ label="Nombre de sacs" type="number" min={0} value={sacs} onChange={setSacs} suffixe="sacs" required />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <p class="intro">Pour les vendre : Ventes, « Fientes / fumier », activité Poules pondeuses.</p>
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

export const resumeEau = (litresJour: number, poules: number) => `${fmtInt(litresJour)} L (${fmtInt((litresJour / Math.max(1, poules)) * 1000)} ml par poule)`;
