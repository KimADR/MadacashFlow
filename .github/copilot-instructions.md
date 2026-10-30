# Instructions permanentes - MadaCash Flow

## Mission
Construire progressivement un SaaS B2B de gestion des créances clients, des paiements partiels, du recouvrement et des prévisions de trésorerie pour PME malgaches. La priorité absolue est la justesse financière, la séparation des entreprises, la testabilité et la simplicité d'usage.

## Architecture de référence
- Monorepo pnpm workspaces ; `apps/web` = Next.js App Router TypeScript ; `apps/api` = NestJS TypeScript ; `packages/contracts` = types/schémas partages.
- PostgreSQL + Prisma, migrations versionnées, Docker Compose en local, API REST `/api/v1`, monolithe modulaire.
- Aucun service bancaire/telecom ne doit être simulé comme intégration officielle en production. Pas de microservices, d'IA pour les décisions financières, ni d'envoi WhatsApp automatique dans le MVP.
- Structure métier par modules `auth`, `tenants`, `clients`, `invoices`, `payments`, `collections`, `forecast`, `reports`, `audit`.

## Règles financières (invariants)
- Monnaie MGA uniquement en V1 ; montants entiers en ariary, SQL BIGINT ; jamais de float pour l'argent.
- `tenantId` dérive de session vérifiée, pas de paramètre client permettant de choisir un tenant non autorisé.
- Solde facture = montant facture - somme des allocations de paiements CONFIRMÉS, avec ajustements hors scope V1 ; ne pas exposer un champ mutable `paidAmount`.
- Paiement `PENDING` avant confirmation du FINANCE/ADMIN ; allocation uniquement de paiements CONFIRMED ; confirmation et allocation auditables et idempotentes.
- Refuser atomiquement toute sur-affectation ou affectation inter-entreprises, y compris sous concurrence de requêtes. Utiliser transactions et contraintes base.
- Date échéance comme date calendaire ; en retard seulement si `dueDate < today` ; `createdAt` et logs en UTC.
- Promesse de règlement != encaissement réel. Litige = pas de relance automatique. L'export CSV doit neutraliser les cellules interprétables comme formules.

## Sécurité et vie privée
- Argon2id pour les mots de passe ; sessions serveur revocables, jetons opaques hachés en DB ; cookie HttpOnly/Secure en production/SameSite, contrôles anti-CSRF/Origin.
- RBAC serveur ADMIN / FINANCE / SALES / VIEWER ; rate limiting, vérification de tous les IDs à travers tenant, validation stricte et limites de taille CSV.
- Interdiction de committer `.env`, identifiants, secrets, fichiers de vrais clients, dumps de production. Utiliser jeux de données fictifs.
- Journaliser les actions sensibles sans afficher les secrets ni des données personnelles excessives. Respecter les dispositions applicables à Madagascar, à faire vérifier par un conseil habilité avant production.

## Standards de travail
- Interface sobre et mobile, en français, fond blanc ; accent #1863A6, titres #0A1C2A ; UI accessible au clavier ; messages d'erreur clairs ; états vide/chargement/erreur.
- Noms du code en anglais, textes utilisateurs en français. Validation côté backend obligatoire même si déjà présente côté client.
- Livrer par petits incréments avec migrations, tests automatisés, README à jour, ADR pour choix sensibles.
- Ne jamais dire qu'un test a réussi sans l'avoir exécuté. Expliquer toute commande impossible et le résultat attendu.
- Avant toute modification : inspecter l'existant et lire `docs/cadrage.md`. Ne pas supprimer des fonctionnalités non demandées.
- Après chaque étape : résumer modifications, tests exécutés, limites, risques, commandes de vérification et arrêter pour validation. Pas de déploiement, message externe, achat ni manipulation de vraie donnée sans approbation explicite.

- Montants BIGINT exposés dans le JSON comme chaînes décimales, ne jamais sérialiser directement un bigint en JSON standard.
