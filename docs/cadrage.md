# MadaCash Flow - Cadrage métier court pour Copilot

Date de cadrage : 30 octobre 2026. Nom de travail provisoire.
Statut : Hypothèse d'opportunité, discovery à conduire auprès de 25 entreprises ; ne pas considérer les prix ou les exigences métier comme validés définitivement.

## Vision
Permettre au dirigeant, au financier et au commercial d'une PME malgache de connaître le montant des factures dues, de suivre les échéances, d'effectuer des relances tracées, de rapprocher les paiements partiels et de projeter la trésorerie sur 13 semaines.

## Cible V1
PME B2B distribution, services et maintenance. Volume indicatif 20-300 factures clients/mois. Application responsive, français, monnaie MGA en ariary entiers, navigateur bureau et mobile.

## MVP P0
- Authentification, sessions sécurisées, RBAC, multi-tenant strict.
- Clients B2B, factures et import CSV avec aperçu et détection de doublons.
- Balance âgée ; suivi de l'encours et des échéances.
- Paiements manuels / import CSV, confirmation et affectations transactionnelles.
- File de relance, promesses, litiges et journal des actions.
- Prévision prudente sur 13 semaines avec hypothèses visibles et dépenses prévues.
- Dashboard, audit, CSV export, sauvegardes et tests.

## Hors scope initial
Comptabilité complète, facturation fiscale, automatisation du recouvrement judiciaire, initiation de paiements, APIs bancaires non autorisées, IA predictive, WhatsApp automatique, mode offline financier complet.

## Rôles
ADMIN gère utilisateurs et configuration ; FINANCE confirmé/affecte paiements et analyse ; SALES gère les dossiers attribués ; VIEWER lecture/rapports, aucune mutation.

## Règles invariantes
MGA entiers SQL BIGINT ; `remainingAr = invoice.amountAr - SUM(allocations liées à des paiements confirmés)` ; pas de double comptage ni de sur-affectation ; invoice unique par `(tenantId, clientId, number)` ; paiement `PENDING` avant confirmation ; droits et tenant vérifiés dans l'API ; dates échéance en jour calendaire ; litige bloque la relance automatique ; promesse non encaissée ; transactions atomiques et journal d'audit.

## Recette métier principale
Créer/importer une facture 3 000 000 Ar ; saisir et confirmer un paiement de 1 000 000 Ar ; affecter ; vérifier que le reste à payer est 2 000 000 Ar dans la facture, la file de relance et les rapports. Un utilisateur de Tenant A ne doit jamais lire ou modifier Tenant B. Deux requêtes concurrentes ne doivent jamais sur-affecter.

## Guide technique
Voir `.github/copilot-instructions.md` et les prompts dans `.github/prompts/`. Le premier objectif est le socle technique, puis les modules incrementaux. Une validation humaine est requise après chaque phase.
