# ADR-002 : Authentification, sessions et isolation des entreprises

- Date : 2026-11-01
- Statut : acceptée pour le MVP

## Contexte

L'API doit authentifier les utilisateurs sans exposer de jeton réutilisable
dans le navigateur, permettre la révocation des sessions et isoler les accès
par entreprise. Les mutations doivent également résister aux requêtes
inter-sites.

## Décisions

- Les mots de passe sont hachés avec Argon2id.
- Le navigateur reçoit un jeton de session opaque dans un cookie
  `HttpOnly`, `SameSite=Strict`, `Secure` en production. Seul son SHA-256 est
  conservé dans la table `Session`; expiration et révocation sont contrôlées
  par l'API.
- Le cookie de session est limité à sept jours par défaut, configurable de
  1 à 30 jours. Il n'est jamais renvoyé dans une réponse JSON.
- L'utilisateur choisit explicitement une entreprise après connexion.
  L'API vérifie son appartenance avant d'enregistrer l'entreprise active dans
  la session. Les routes métier prennent le tenant depuis cette session, pas
  depuis un paramètre, corps ou en-tête client.
- Chaque route protégée utilise `AuthGuard`; les routes métier ajoutent
  `RolesGuard` et une liste de rôles autorisés.
- Les mutations vérifient l'en-tête `Origin` contre `WEB_ORIGIN` et un jeton
  CSRF aléatoire transmis à la fois par cookie et en-tête.
- La limitation de débit du login est fixée à cinq tentatives par minute et
  par adresse IP avec le stockage mémoire de Nest Throttler.
- Les sélections d'entreprise sont consignées dans `AuditLog`.

## Conséquences et limites

- Le navigateur communique avec `/api/v1` via le rewrite Next.js de même
  origine ; les cookies ne sont pas exposés à JavaScript, sauf le cookie CSRF
  qui ne permet pas à lui seul d'authentifier une session.
- Le stockage mémoire du rate limiting est adapté au MVP mono-instance ; une
  production multi-instance devra utiliser un stockage partagé.
- Le seed de démonstration exige un mot de passe local fourni par variable
  d'environnement et ne fournit aucun credential par défaut.
- Les rôles doivent être définis explicitement sur chaque nouvelle route
  métier avant sa mise en service.
