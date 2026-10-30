# Prompt 00 - Initialiser le repository (premier message à envoyer)

Nous commençons seulement l'ÉTAPE 00 du projet MadaCash Flow.
Lis les fichiers .github/copilot-instructions.md et docs/cadrage.md.
S'il s'agit d'un dossier vide, utilise les spécifications de ces
fichiers et du prompt général. N'implémente aucun module métier.

Objectif : mettre en place un monorepo developpable et testable.

Actions exigées :
1. Vérifie la version Node.js LTS, pnpm, Git et Docker disponibles.
   Choisis des versions de dépendances supportées et compatibles ;
   note les versions réelles dans README et lockfile.
2. Crée pnpm-workspace.yaml, package.json racine et scripts cohérents :
   dev, build, lint, typecheck, test, format.
3. Crée apps/web en Next.js App Router + TypeScript + Tailwind.
   Crée la page / avec une page d'accueil temporaire professionnelle
   'MadaCash Flow - Socle initial' et le lien d'État /health.
4. Crée apps/api en NestJS avec prefixe /api/v1, route GET
   /api/v1/health retournant status, service et timestamp.
5. Crée packages/contracts avec TypeScript, Zod ou système de
   contrats équivalents documenté. Mets un exemple de contrat simple.
6. Ajoute docker-compose.yml pour PostgreSQL 16 local avec volume
   et healthcheck ; pas de base et mot de passe de production.
7. Ajoute .env.example (uniquement des exemples), .gitignore,
   tsconfig partagé si utile, ESLint, Prettier et README de démarrage.
8. Ajoute un workflow GitHub Actions qui fait installation, lint,
   typecheck, tests et build sur pull request. Aucun déploiement.
9. Documente la stratégie de proxy même origine /api/v1 vers NestJS,
   l'approche des sessions, les décisions à valider dans docs/adr/.
10. Ajoute un test smoke API et un test smoke frontend faciles à lancer.

Critères d'acceptation :
- Le serveur web et le serveur API démarrent localement.
- GET /api/v1/health retourne HTTP 200.
- Un visiteur voit une page sobre avec le nom du projet.
- docker compose up -d lance PostgreSQL et son healthcheck passe.
- pnpm install, pnpm lint, pnpm typecheck, pnpm test et pnpm build
  passent lorsque l'environnement permet l'exécution.
- Aucun jeton, mot de passe réel ou credential n'est commité.

Ne crée ni vraies factures, ni paiements, ni UI complexe à cette ÉTAPE.
Applique seulement l'ÉTAPE 00, puis ARRETE-TOI et donne les commandes
exactes pour vérifier. Signale honnêtement les commandes non exécutées.
