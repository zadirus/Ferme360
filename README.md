# Ferme360

Application de gestion de ferme (poules pondeuses, moutons, bœufs).
Application web installable (PWA), qui fonctionne sans réseau.

## Développement

```bash
npm install
npm run dev      # serveur local
npm run build    # construit dans dist/
```

## Déploiement (Cloudflare Pages)

- Commande de build : `npm run build`
- Dossier de sortie : `dist`
- Variable : `NODE_VERSION` = `22`

Chaque envoi sur `main` met la production à jour ; chaque autre branche reçoit une adresse d'aperçu.
