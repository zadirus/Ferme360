# Ferme360

Application de gestion de ferme (poules pondeuses, moutons, bœufs).
Application web installable (PWA), qui fonctionne sans réseau.

## Développement

```bash
npm install
npm run dev      # serveur local
npm run build    # construit dans dist/
```

## Déploiement (Cloudflare Workers, fichiers statiques)

- Nom du projet : `ferme360` (voir `wrangler.jsonc`)
- Commande de build : `npm run build`
- Commande de déploiement : `npx wrangler deploy`
- Variable (si besoin) : `NODE_VERSION` = `22`

Chaque envoi sur `main` met la production à jour ; les autres branches reçoivent une adresse d'aperçu.
