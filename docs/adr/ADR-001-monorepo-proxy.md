# ADR-001 : Monorepo et proxy de même origine

- Date : 2026-10-30
- Statut : acceptée pour l'initialisation du projet

## Contexte

Le projet doit permettre de livrer un SaaS de gestion des créances pour PME malgaches avec une base technique fiable, une séparation stricte des tenants et des flux financiers auditables. Le monorepo regroupe un front web, une API et des contrats partagés.

## Décision

- Utiliser un monorepo pnpm workspace.
- Séparer `apps/web` (Next.js), `apps/api` (NestJS) et `packages/contracts` (schémas partagés).
- Préférer un proxy de même origine pour les appels API `'/api/v1'` depuis le front web vers le service NestJS local.
- Faire dériver le tenant de la session authentifiée côté serveur plutôt que des données transmises par le client.

## Justification

- Le front et l'API partagent le même périmètre de sécurité et les mêmes conventions de routage.
- Le proxy de même origine réduit le risque de fuite de cookies et simplifie les contrôles CORS.
- La séparation des responsabilités permet de partager les contrats TypeScript/Zod sans coupler les applications.

## Conséquences

- Les appels web → API sont explicites et traçables.
- Les sessions server-side restent la source de vérité pour l'authentification.
- Le design nécessite une validation stricte sur les droits et le tenant dans chaque requête backend.
