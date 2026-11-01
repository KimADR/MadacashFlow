# ADR-003 — Confirmation et affectation des paiements

- Statut : accepté pour la V1 locale
- Date : 1 novembre 2026

## Contexte

Un paiement saisi ne constitue pas un encaissement confirmé. Une affectation ne
doit jamais dépasser le montant confirmé disponible ni le solde d'une facture,
y compris lorsque plusieurs requêtes concurrentes ciblent la même facture.
Toutes les opérations doivent rester isolées par entreprise et auditables.

## Décision

- Les paiements manuels sont créés en `PENDING`; seuls ADMIN et FINANCE peuvent
  les confirmer et les affecter.
- La confirmation est idempotente et auditée. Une affectation est possible
  seulement après confirmation.
- Une transaction PostgreSQL verrouille la ligne du paiement et celle de la
  facture (`FOR UPDATE`) avant de calculer les allocations existantes et
  d'insérer l'allocation. Tous les chemins d'affectation prennent ces verrous
  dans le même ordre.
- Une répétition de la même affectation paiement/facture et du même montant
  retourne l'affectation existante ; une répétition avec un montant différent
  est refusée.
- Des clés étrangères composites portent `tenantId` dans les références du
  paiement et de l'allocation. Les contraintes SQL garantissent les montants
  strictement positifs ; les limites de solde sont vérifiées dans la transaction.
- Le solde d'une facture est calculé à la lecture comme son montant moins les
  allocations associées à des paiements confirmés. Aucun montant payé mutable
  n'est stocké.
- Les modes de paiement sont des saisies descriptives ; aucune connexion
  bancaire ou opérateur mobile n'est simulée.
- L'import CSV valide et prévisualise les lignes avant écriture. Le commit
  crée uniquement des paiements `PENDING`, rattache chaque ligne à son lot
  d'import, journalise l'opération et déduplique un fichier par entreprise
  avec son empreinte SHA-256.

## Conséquences

L'annulation d'une facture ayant une allocation confirmée est refusée. Les
paiements et leurs affectations sont conservés sans modification destructive ;
les corrections nécessiteront un workflow audité dédié avant production.
