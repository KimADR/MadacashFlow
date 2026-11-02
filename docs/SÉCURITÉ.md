# Revue sécurité et QA — étape 06

## Portée et statut

Revue technique factuelle du dépôt au 1 novembre 2026. Cette revue ne
remplace pas un audit indépendant, un test d'intrusion, ni une validation
juridique. Aucun déploiement ni import de données réelles n'a été effectué.

## Contrôles observés

| Surface | Contrôle en place | Vérification |
|---|---|---|
| Authentification | Argon2id, jeton opaque de session stocké sous forme hachée, expiration et révocation serveur | Tests unitaires et tests API avec Prisma simulé |
| Session et CSRF | Cookie de session HttpOnly/SameSite, validation Origin et double jeton CSRF sur les écritures | Tests d'authentification |
| RBAC | Guards de session et de rôle sur les contrôleurs métier ; routes d'import réservées à ADMIN/FINANCE | Contrôleurs parcourus et tests de rôles existants |
| Isolation entreprise | Tenant dérivé du contexte de session ; requêtes métier et SQL paramétré filtrés par tenant | Tests API clients/factures ; revue des services et requêtes SQL |
| Validation | `ValidationPipe` global avec `whitelist`, `forbidNonWhitelisted` et `transform` ; contraintes DTO | Tests métier et validations existantes |
| Pagination | Limite maximale de 100 éléments pour les listes paginées | DTO de pagination et tests existants |
| CSV | Taille maximale de fichier 1 000 000 octets, limite de 5 000 lignes, plafond de 1 024 octets par champ multipart ; export neutralisant les formules | Tests d'import et d'export existants |
| Brute force | Limite globale en mémoire de 100 requêtes/minute et limite login de 5/minute | Configuration NestJS et décorateur de login |
| PostgreSQL | La CI démarre une base `madacash_test` dédiée et exécute les migrations versionnées puis les tests d'allocation | `.github/workflows/ci.yml`, `apps/api/test-postgres/` |
| Sauvegarde/restauration | Test CI sur bases `madacash_restore_source` et `madacash_restore_target` isolées ; le script refuse une cible non vide | `apps/api/scripts/test-postgres-restore.mjs` |
| Accessibilité | Axe vérifie WCAG 2 A/AA sur connexion, factures, paiements et recouvrement via Chromium | `apps/web/tests/phase06.spec.ts` |
| Dépendances | Audit de tout l'arbre de dépendances, CI bloquante à partir de HIGH | `pnpm audit --audit-level=high` dans la CI |
| CI | Lint, typecheck, tests, PostgreSQL, restauration, audit dépendances, build, E2E/accessibilité ; aucun job de déploiement configuré | `.github/workflows/ci.yml` |

## Corrections de cette étape

- L'API accepte maintenant `PATCH` dans CORS, nécessaire à l'édition des
  dépenses de prévision lorsque l'API est appelée depuis une origine distincte.
- Les deux imports CSV bornent maintenant la taille des champs multipart et le
  nombre total de parties.
- La route publique `/api/v1/ready` effectue une requête DB minimale et répond
  `503 DATABASE_NOT_READY` sans exposer l'erreur de connexion ; `/api/v1/health`
  reste le contrôle de vie du processus.

## Risques et vérifications restant à faire

| Priorité | Risque ou lacune | Action requise |
|---|---|---|
| Haute | Les tests PostgreSQL couvrent désormais la concurrence de deux allocations et l'isolation d'un paiement inter-entreprises ; le reste des invariants financiers n'est pas encore exécuté sur PostgreSQL. | Étendre les scénarios d'intégration après la stabilisation de l'environnement CI. |
| Moyenne | Le throttling NestJS utilise le stockage mémoire par défaut et ne partage pas les quotas entre plusieurs instances. | Choisir et valider un stockage partagé avant un déploiement multi-instance. |
| Moyenne | La politique exacte de sauvegarde, rétention, chiffrement et reprise n'est pas encore validée. | Décision du responsable d'exploitation et test de restauration avant pilote. |
| Moyenne | Axe automatise les critères WCAG 2 A/AA, mais ne couvre pas l'ensemble du parcours clavier/lecteur d'écran ni les pages non incluses. | Compléter par une revue manuelle avant pilote. |
| Faible | Un avis sans version corrigée reste présent dans `deepmerge@4.3.1`, dépendance de développement sous Nest CLI. Aucun chemin de production ne l'utilise dans l'audit actuel. | Suivre la correction amont de `fork-ts-checker-webpack-plugin`; ne pas inventer d'override de package non corrigé. |
| Moyenne | L'audit des dépendances ne remplace pas une revue des licences. | Revue des licences par le responsable produit/juridique. |

Les tests PostgreSQL d'allocation, parcours E2E, restauration et audit de
dépendances ne sont déclarés réussis qu'après leur exécution locale/CI ci-dessous.
Ne pas utiliser cette revue comme autorisation de mise en production.

## Vérifications exécutées pour cet incrément

- `pnpm lint` : réussi.
- `pnpm typecheck` : réussi.
- `pnpm test` : réussi, 16 suites API / 82 tests et smoke test Web.
- `pnpm build` : réussi pour les contrats, l'API et le Web avec l'URL du faux
  serveur API configurée pour le build Next.js.
- `pnpm --filter @mada-cash/api run test:postgres` : réussi sur un conteneur
  PostgreSQL temporaire dédié, distinct des services déjà présents ; 2 tests
  d'intégration réussis après application des 6 migrations versionnées.
- `pnpm audit --prod --audit-level=high` : réussi, aucune vulnérabilité connue
  dans l'arbre de production.
- `pnpm audit --audit-level=high` : réussi au seuil HIGH après mises à jour ;
  un avis LOW non corrigé en dépendance de développement reste documenté ci-dessus.
- `pnpm --filter @mada-cash/web run test:e2e` : 5 tests réussis après le build
  dédié au faux serveur API, dont les 3 parcours métier, le cas sans solde
  initial configuré et l'audit Axe.
- Test de limite login : 5 tentatives reçoivent l'erreur d'authentification,
  la 6e est limitée à HTTP 429.
- `pnpm --filter @mada-cash/api run test:restore` : NON EXÉCUTÉ localement,
  les URL des deux bases dédiées ne sont pas configurées et les outils
  PostgreSQL client ne sont pas installés. La CI crée les bases jetables et
  lance le test.
- L'API interactive répond et la session authentifiée a chargé les pages
  principales en lecture seule. La route de solde initial vide a révélé une
  réponse HTTP sans corps ; le contrat renvoie maintenant une enveloppe JSON
  explicite et le tableau de bord se charge sans erreur.
- `pnpm --filter @mada-cash/api exec jest --runInBand src/auth/auth.e2e.spec.ts` :
  8 tests réussis, dont le contrôle de limite login (6e tentative HTTP 429).
- `pnpm exec prisma validate --schema prisma/schema.prisma` : schéma valide,
  sans connexion à une base.
- `git diff --check` : réussi.

La base de développement `madacash` a été consultée par l'application pendant
les tests interactifs ; aucune facture, aucun paiement, client ou autre donnée
métier n'a été créé ou modifié. La sélection de l'entreprise a uniquement
actualisé le contexte de session.
