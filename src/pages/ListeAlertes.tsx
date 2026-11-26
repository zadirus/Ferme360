import { NOM_CATEGORIE, type CategorieNotif } from '../alertes';
import { Retour } from '../ui';
import { useAlertes } from '../useAlertes';

// Où aller pour traiter chaque sorte d'alerte
const OU: Record<CategorieNotif, [string, string]> = {
  rappels: ['/elevage', 'Élevage'],
  misesbas: ['/elevage', 'Élevage'],
  delais: ['/elevage', 'Élevage'],
  stock: ['/stocks', 'Stocks'],
  creances: ['/clients', 'Clients'],
  poules: ['/poules', 'Poules']
};
const ORDRE: CategorieNotif[] = ['poules', 'rappels', 'delais', 'misesbas', 'stock', 'creances'];

// La liste de toutes les alertes en cours. Une alerte disparaît d'elle-même quand le problème est réglé.
export function ListeAlertes() {
  const alertes = useAlertes();
  const groupes = ORDRE.map((c) => ({ c, liste: alertes.filter((a) => a.categorie === c) })).filter((g) => g.liste.length > 0);
  return (
    <section>
      <Retour vers="/" texte="Accueil" />
      <h2>Alertes {alertes.length > 0 ? `(${alertes.length})` : ''}</h2>
      <p class="intro">Une alerte reste ici tant que le problème n'est pas réglé : elle disparaît toute seule dès que vous enregistrez ce qu'il faut.</p>
      {groupes.map(({ c, liste }) => (
        <div key={c} class="groupe-alertes">
          <h3>{NOM_CATEGORIE[c]} <span class="compte-alertes">{liste.length}</span></h3>
          <ul>
            {liste.map((a) => <li key={a.texte}>⚠ {a.texte}</li>)}
          </ul>
          <a class="lien vert" href={`#${OU[c][0]}`}>Aller dans {OU[c][1]} →</a>
        </div>
      ))}
      {alertes.length === 0 && <p class="succes" role="status">Aucune alerte en cours. Tout est à jour.</p>}
    </section>
  );
}
