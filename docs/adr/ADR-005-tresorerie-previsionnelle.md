# ADR-005 — Prévision de trésorerie sur 13 semaines

- Statut : accepté pour la V1 locale
- Date : 1 novembre 2026

## Contexte

Les entreprises ont besoin d'une projection hebdomadaire fondée sur leur
trésorerie réellement disponible, les paiements confirmés, les créances, les
promesses de paiement et les dépenses prévues. Les montants doivent rester
exacts en ariary entiers et les hypothèses visibles.

## Décisions

- Un solde d'ouverture daté est saisi chaque jour par FINANCE ou ADMIN. La
  valeur du jour est unique par entreprise, modifiable avec audit et n'est
  jamais supposée égale à zéro. Tant qu'elle n'existe pas, la projection est
  explicitement désactivée.
- Les 13 semaines couvrent les 91 jours commençant le lendemain de la date du
  solde d'ouverture. Les dates sont des dates calendaires de Madagascar.
- Le moteur de calcul est pur et travaille exclusivement avec des `bigint`.
  Les montants exposés par l'API sont des chaînes décimales.
- Seuls les paiements confirmés, datés après le solde d'ouverture et dans
  l'horizon, sont des encaissements réels projetés. Leurs affectations sont
  retirées des créances attendues afin d'éviter un double comptage.
- Un paiement daté dans le futur reste non confirmé jusqu'à sa date de
  réception ; le serveur refuse sa confirmation anticipée. Une confirmation
  déjà enregistrée reste idempotente.
- Le montant d'une promesse est projeté séparément à sa date. Le reliquat
  suit la date d'échéance. Une promesse n'est jamais présentée comme un
  encaissement confirmé.
- Dans le scénario attendu, une créance échue sans promesse est reportée en
  semaine 1. Dans le scénario prudent, cette créance échue n'est pas supposée
  encaissée ; les échéances futures non contestées et les promesses futures
  sont conservées.
- Les factures en litige restent dans les créances ouvertes, mais ne génèrent
  aucun encaissement projeté dans les deux scénarios.
- Les dépenses sont des sorties prévues manuelles, modifiables ou annulables
  avec audit. Seules les dépenses planifiées dans l'horizon sont incluses.
- L'export CSV de la balance âgée limite la réponse à 10 000 factures ouvertes
  et neutralise les valeurs susceptibles d'être interprétées comme formules.
- FINANCE/ADMIN gèrent les hypothèses ; FINANCE/ADMIN/VIEWER peuvent lire les
  prévisions et rapports. SALES ne reçoit pas d'accès à ces données de
  trésorerie dans cette étape.

## Conséquences

Le scénario attendu est une estimation, pas une promesse de paiement du client.
La saisie du solde doit être actualisée chaque jour pour conserver un point de
départ fidèle. Le scénario prudent est volontairement conservateur pour les
retards et les litiges. Les exports au-delà de 10 000 factures nécessitent un
filtrage ou une évolution vers un export asynchrone.
