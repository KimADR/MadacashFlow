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

Configurer la connexion à votre PostgreSQL dans `.env` à partir de
`.env.example`. Si PostgreSQL tourne déjà dans Docker, utiliser son port
publié sur l'hôte dans `DATABASE_URL`; ne pas créer un second conteneur ni
modifier des données existantes pendant cette étape.

Appliquer le schéma versionné et créer le compte de démonstration :

```bash
pnpm --filter @mada-cash/api run db:migrate
pnpm --filter @mada-cash/api run db:seed
```

Le seed exige `DEMO_ADMIN_EMAIL` et un `DEMO_ADMIN_PASSWORD` local d'au moins
16 caractères dans `.env`. Il ne contient aucun mot de passe par défaut.

Pour démarrer une base locale uniquement si aucune base n'est déjà disponible :

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
Voir `docs/adr/ADR-002-auth-sessions-tenants.md` pour les sessions, l'anti-CSRF et l'isolation tenant.
Voir `docs/adr/ADR-003-payments-allocations.md` pour la confirmation et l'affectation transactionnelles des paiements.
Voir `docs/adr/ADR-004-manual-collections.md` pour le suivi manuel des relances, promesses et litiges.
Voir `docs/adr/ADR-005-tresorerie-previsionnelle.md` pour les règles et hypothèses de prévision sur 13 semaines.

## Variables d'environnement

Copier `.env.example` vers `.env` selon le besoin local, sans jamais committer de vrais secrets ou credentials de production.

## Authentification locale

Ouvrir `/login`, saisir le compte de démonstration puis choisir explicitement
l'entreprise avant d'accéder à `/dashboard`. Les routes API protégées utilisent
la session serveur et le tenant actif validé côté API. Pour révoquer une
session, utiliser le bouton de déconnexion.

## Clients, factures et import

- `/clients` permet la création et la recherche paginée de clients.
- `/invoices` permet la création et le filtrage des factures, l'annulation
  auditée et la consultation des tranches d'ancienneté.
- `/payments` permet la saisie manuelle d'un paiement `PENDING`, sa confirmation
  par FINANCE/ADMIN, puis son affectation auditable aux factures actives du même
  client. Les allocations sont transactionnelles, idempotentes par paiement et
  facture, et ne peuvent pas dépasser le paiement ou le solde d'une facture.
- `/collections` affiche la file des factures actives ayant un solde ouvert,
  enregistre les relances manuelles, les promesses et les litiges, et consulte
  leur historique audité. Une promesse ne diminue jamais le solde ; un litige
  ouvert suspend les actions de relance et de promesse. Aucun message n'est
  envoyé automatiquement. ADMIN/FINANCE gèrent les dossiers, VIEWER les
  consulte ; SALES reste bloqué jusqu'à la prise en charge des dossiers attribués.
- `/forecast` affiche une projection de trésorerie sur 13 semaines et la
  balance âgée CSV. ADMIN/FINANCE saisissent le solde d'ouverture du jour et
  gèrent les dépenses prévues ; ADMIN/FINANCE/VIEWER consultent la projection.
  Les paiements confirmés, créances, promesses et dépenses sont affichés
  séparément. La projection est désactivée tant que le solde du jour n'est pas
  renseigné ; les hypothèses des scénarios attendu et prudent sont décrites dans
  `docs/adr/ADR-005-tresorerie-previsionnelle.md`.
- `POST /api/v1/imports/payments/preview` valide un CSV sans écriture ;
  `/commit` crée les paiements valides en statut `PENDING` dans une transaction.
  Les répétitions du même fichier sont idempotentes par entreprise ; le mode
  et la date doivent être valides, la référence client déjà connue. Un import
  ne confirme ni n'affecte automatiquement les paiements.
  Les en-têtes par défaut sont `clientRef,amountAr,receivedAt,method,reference` ;
  la dernière colonne est facultative. Les codes de méthode sont
  `CASH`, `BANK_TRANSFER`, `MOBILE_MONEY`, `CHEQUE` et `OTHER`.
- Les soldes et la balance âgée ne diminuent qu'après confirmation et affectation
  d'un paiement. Aucune intégration bancaire ou mobile money n'est simulée.
- `POST /api/v1/imports/invoices/preview` valide un CSV sans écrire de
  facture ; `POST /api/v1/imports/invoices/commit` importe les lignes valides
  en une transaction et rend les répétitions idempotentes par entreprise.
- L'import attend les colonnes `clientRef`, `number`, `issueDate`, `dueDate`
  et `amountAr` par défaut. Les noms de colonnes peuvent être remappés dans
  l'interface. Les montants sont des ariary entiers, sans séparateur.
- Limites CSV : 1 Mo, 5 000 lignes, encodage UTF-8. Les références clients
  doivent déjà exister dans l'entreprise active.
Les migrations versionnées ajoutent les tables clients, factures, lots d'import,
paiements et allocations, avec contraintes d'unicité, de montant positif et de
rattachement client/entreprise. Le seed crée deux entreprises
et des données de démonstration fictives ; il demande toujours un mot de
passe local dans `.env`.
