import { peut } from '../droits';
import { useRole } from '../hooks';
import { Retour } from '../ui';

const Bloc = ({ titre, children, ouvert }: { titre: string; children: preact.ComponentChildren; ouvert?: boolean }) => (
  <li><details open={ouvert}><summary><strong>{titre}</strong></summary><div class="aide">{children}</div></details></li>
);

export function Aide() {
  const role = useRole();
  const gestion = peut(role, 'argent');
  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Aide</h2>
      <ul>
        {gestion && (
          <Bloc titre="Par où commencer (propriétaire, gérant)" ouvert>
            <ol>
              <li>Dans <b>Argent</b>, « Corriger un solde » : indiquez l'argent que vous avez aujourd'hui en caisse, en Mobile Money et en banque.</li>
              <li>Reprenez vos données : <b>Plus, Reprendre mes données</b> (animaux, clients et leurs soldes, stock de départ, bandes). Sinon, créez-les à la main.</li>
              <li>Dans <b>Plus, Équipe</b> : créez un compte par personne (ouvrier, vétérinaire, gérant). Chacun ne voit que ce qui le concerne.</li>
              <li>Dans <b>Plus, Notifications</b> : activez le résumé du matin sur votre téléphone. Dans <b>Plus, Code PIN</b> : verrouillez l'application.</li>
              <li>Chaque mois : <b>Plus, Sauvegarde</b> puis « Partager la sauvegarde » vers votre Drive ou votre e-mail.</li>
            </ol>
          </Bloc>
        )}
        <Bloc titre="Au quotidien : poules" ouvert={!gestion}>
          <p>Onglet <b>Élevage</b>, puis <b>Poules</b>, puis votre bande : <b>Ramassage</b> (bons, fêlés, cassés), <b>Mortalité</b>, <b>Aliment</b>. Le taux de ponte, l'effectif et le stock d'œufs se calculent tout seuls. Vous pouvez saisir deux ramassages par jour.</p>
        </Bloc>
        <Bloc titre="Au quotidien : moutons et bœufs">
          <p>Onglet <b>Élevage</b>, <b>Moutons</b> ou <b>Bœufs</b>. Chaque animal a sa fiche : pesée, soin, reproduction, mise bas (les petits sont créés avec leur mère), sortie. Pour peser tout un lot d'un coup : ouvrez le lot, « Pesée du lot ».</p>
          <p>Après un soin avec délai d'attente, la vente et l'abattage sont bloqués jusqu'à la fin du délai.</p>
        </Bloc>
        {gestion && (
          <Bloc titre="Vendre et encaisser">
            <p>Onglet <b>Ventes</b>, « Nouvelle vente » : œufs, animaux (au poids ou sur pied), fientes. Indiquez ce qui est payé maintenant : le reste devient une créance du client. Sur la fiche du client, <b>Encaisser</b> enregistre un paiement, et <b>Reçu PDF</b> se partage par WhatsApp.</p>
          </Bloc>
        )}
        <Bloc titre="Sans réseau">
          <p>Tout fonctionne sans internet : saisissez normalement. Les saisies restent sur le téléphone, marquées « en attente », et partent toutes seules dès que le réseau revient. Vérifiez la pastille en haut : « À jour » veut dire que tout est envoyé.</p>
        </Bloc>
        <Bloc titre="J'ai perdu ou changé de téléphone">
          <p>Rien n'est perdu : installez l'application sur le nouveau téléphone, connectez-vous avec votre nom et votre mot de passe, et vos données reviennent. Si le téléphone perdu était celui d'un employé, désactivez son compte dans <b>Plus, Équipe</b> (propriétaire).</p>
        </Bloc>
        <Bloc titre="Qui voit quoi">
          <p><b>Propriétaire</b> : tout et la gestion des comptes. <b>Gérant</b> : tout sauf les comptes. <b>Ouvrier</b> : élevage et stocks, jamais d'argent. <b>Vétérinaire</b> : soins et santé, jamais d'argent. Les données interdites ne sont même pas envoyées sur leur téléphone.</p>
        </Bloc>
        <Bloc titre="Les notifications n'arrivent pas">
          <p>Voir <b>Plus, Notifications</b> : ajoutez l'application à l'écran d'accueil de Chrome, autorisez les notifications, et retirez l'économie de batterie pour Chrome (surtout sur Xiaomi, Tecno, Infinix, Samsung). « Envoyer un test » permet de vérifier tout de suite.</p>
        </Bloc>
      </ul>
    </section>
  );
}
