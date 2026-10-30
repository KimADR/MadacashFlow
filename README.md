# MadaCash Flow

MadaCash Flow est un monorepo de base pour la plateforme de gestion des créances et des encaissements B2B ciblee pour les PME malgaches.

## Versions vérifiées

- Node.js : `v24.15.0`
- pnpm : `10.33.2`
- Git : `2.54.0.windows.1`
- Docker : `29.8.1`

## Architecture

- `apps/web` : Next.js App Router + TypeScript + Tailwind
- `apps/api` : NestJS + TypeScript + REST `/api/v1`
- `packages/contracts` : schémas partagés avec Zod

## Démarrage rapide

```bash
pnpm install
pnpm dev
```

Pour démarrer uniquement la base locale :

```bash
docker compose up -d postgres
```

## Scripts du monorepo

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Proxy côté navigateur

Le front web s'appuie sur un proxy de même origine pour les requêtes `/api/v1` vers le service NestJS local. Cela évite de divulguer des cookies cross-site et simplifie la sécurité des sessions. En production, la configuration de routage devra rester explicite et gardée dans le reverse proxy ou le plan de déploiement ; la logique métier ne doit jamais dépendre d'un client pour choisir le tenant.

## ADR

Voir `docs/adr/ADR-001-monorepo-proxy.md` pour la décision technique initiale sur le monorepo, le proxy et la séparation des responsabilités.

## Variables d'environnement

Copier `.env.example` vers `.env` selon le besoin local, sans jamais committer de vrais secrets ou credentials de production.
