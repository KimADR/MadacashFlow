# ADR-004 — Suivi manuel du recouvrement

- Statut : accepté pour la V1 locale
- Date : 1 novembre 2026

## Contexte

Les équipes doivent suivre les factures restant dues sans confondre un échange
commercial, une promesse de paiement et un encaissement confirmé. Les actions
doivent rester attribuables, auditables et isolées par entreprise.

## Décision

- Une file calculée à la lecture présente les factures actives dont le solde,
  calculé depuis les allocations de paiements confirmés, est strictement
  positif. Les montants sont renvoyés en chaînes décimales.
- Les relances sont des comptes rendus manuels. Le canal et l'auteur sont
  conservés ; l'application n'envoie aucun courriel, SMS ou message.
- Les promesses sont des événements datés et audités. Leur montant ne modifie
  ni le solde de la facture ni les allocations de paiement.
- Un dossier de recouvrement est créé à la première action. Un litige ouvert
  suspend les relances manuelles et l'enregistrement de nouvelles promesses
  jusqu'à sa résolution. Cette règle prudente est plus stricte que l'interdit
  de relance automatique du cadrage.
- Chaque mutation verrouille la facture dans une transaction, vérifie le
  tenant de la session et écrit l'événement et la trace d'audit ensemble.
- L'historique retourné est limité aux 100 événements les plus récents par
  facture.
- ADMIN et FINANCE peuvent gérer les dossiers ; VIEWER peut les consulter.
  SALES reste exclu jusqu'à l'ajout d'une attribution vérifiable des dossiers.

## Conséquences

Les équipes ne peuvent pas envoyer de relance depuis l'application et doivent
effectuer elles-mêmes le contact avant de le journaliser. Les commerciaux ne
peuvent pas accéder au recouvrement tant qu'un mécanisme sûr d'attribution des
dossiers n'est pas disponible.
