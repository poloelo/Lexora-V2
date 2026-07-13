/**
 * seed.js — Remplit la base de données avec des données de démo réalistes
 *
 * Objectif : obtenir un jeu de données cohérent (utilisateurs, tâches, coffre-fort,
 * planning) pour des captures d'écran présentables, sans passer par l'API HTTP.
 *
 * Usage : npm run seed
 *
 * Le script est idempotent au sens où il ne supprime rien : il vide uniquement les
 * tables qu'il va re-remplir, pour pouvoir être relancé plusieurs fois sans dupliquer
 * les données ni casser l'admin créé par ADMIN_EMAIL/ADMIN_PASSWORD (voir models/db.js).
 */

import './env.js';
import bcrypt from 'bcryptjs';
import db from './models/db.js';

// Mot de passe commun à tous les comptes de démo (jamais affiché à l'écran,
// juste utile pour se connecter et prendre les captures d'écran)
const DEMO_PASSWORD = 'Demo2026!';
const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

// ── Aide : dates relatives à aujourd'hui ────────────────────────
const today = new Date();

function isoDate(offsetDays) {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function isoDateTime(offsetDays, hour, minute = 0) {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
}

console.log('🌱 Démarrage du seed Lexora...\n');

// ════════════════════════════════════════════════════════════════
//  EMPLOYÉS (utilisateurs de connexion)
// ════════════════════════════════════════════════════════════════

db.exec('DELETE FROM employes');
db.exec("DELETE FROM sqlite_sequence WHERE name = 'employes'");

const employes = [
  { nom: 'Moreau',   prenom: 'Camille',   email: 'camille.moreau@lexora.fr',   poste: 'Directrice générale',      departement: 'Direction',    salaire: 5200, date_embauche: '2019-03-11', role: 'admin' },
  { nom: 'Bertrand', prenom: 'Julien',    email: 'julien.bertrand@lexora.fr',  poste: 'Responsable commercial',   departement: 'Commercial',   salaire: 3400, date_embauche: '2021-06-01', role: 'employe' },
  { nom: 'Lefevre',  prenom: 'Sophie',    email: 'sophie.lefevre@lexora.fr',   poste: 'Comptable',                departement: 'Finance',      salaire: 2900, date_embauche: '2020-09-15', role: 'employe' },
  { nom: 'Girard',   prenom: 'Thomas',    email: 'thomas.girard@lexora.fr',    poste: 'Chargé de clientèle',      departement: 'Support',      salaire: 2600, date_embauche: '2022-01-10', role: 'employe' },
];

const insertEmploye = db.prepare(`
  INSERT INTO employes (nom, prenom, email, poste, departement, salaire, date_embauche, role, password_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const e of employes) {
  insertEmploye.run(e.nom, e.prenom, e.email, e.poste, e.departement, e.salaire, e.date_embauche, e.role, passwordHash);
}
console.log(`✅ ${employes.length} employés créés (mot de passe commun : ${DEMO_PASSWORD})`);

// Table de correspondance prénom → "Prénom Nom" pour les autres tables (assignee, employe planning...)
const nomComplet = Object.fromEntries(employes.map(e => [e.prenom, `${e.prenom} ${e.nom}`]));

// ════════════════════════════════════════════════════════════════
//  TÂCHES
// ════════════════════════════════════════════════════════════════

db.exec('DELETE FROM taches');
db.exec("DELETE FROM sqlite_sequence WHERE name = 'taches'");

const taches = [
  { titre: 'Relancer les factures impayées de juin',        description: 'Contacter les 3 clients en retard de paiement depuis plus de 15 jours.', statut: 'in_progress', assignee: nomComplet.Sophie },
  { titre: 'Préparer les bulletins de paie du mois',         description: 'Vérifier les heures supplémentaires avant export vers le logiciel de paie.', statut: 'todo',         assignee: nomComplet.Sophie },
  { titre: 'Envoyer la proposition commerciale à Dupont SAS', description: 'Devis pour la refonte du site vitrine, à envoyer avant vendredi.',            statut: 'in_progress', assignee: nomComplet.Julien },
  { titre: 'Organiser l\'entretien annuel de Thomas Girard',  description: 'Bilan de fin d\'année, prévoir la grille d\'évaluation.',                     statut: 'todo',         assignee: nomComplet.Camille },
  { titre: 'Mettre à jour le contrat de maintenance Client X', description: 'Ajouter la clause de reconduction tacite validée en réunion.',                statut: 'done',         assignee: nomComplet.Camille },
  { titre: 'Suivi téléphonique du prospect Chambre de Commerce', description: 'Faire un point sur leurs besoins en formation digitale.',                    statut: 'todo',         assignee: nomComplet.Julien },
  { titre: 'Classer les notes de frais du trimestre',         description: 'Scanner et archiver dans le coffre-fort documentaire.',                       statut: 'done',         assignee: nomComplet.Sophie },
  { titre: 'Répondre au ticket support #482',                 description: 'Client signale un souci de connexion à son espace personnel.',                statut: 'in_progress', assignee: nomComplet.Thomas },
  { titre: 'Préparer la réunion d\'équipe du lundi',          description: 'Ordre du jour : objectifs Q3 et retours clients.',                            statut: 'todo',         assignee: nomComplet.Camille },
  { titre: 'Vérifier la conformité RGPD des formulaires site', description: 'Audit rapide avant la mise en ligne de la nouvelle page contact.',            statut: 'todo',         assignee: nomComplet.Thomas },
];

const insertTache = db.prepare(`
  INSERT INTO taches (titre, description, statut, assignee) VALUES (?, ?, ?, ?)
`);
for (const t of taches) {
  insertTache.run(t.titre, t.description, t.statut, t.assignee);
}
console.log(`✅ ${taches.length} tâches créées`);

// ════════════════════════════════════════════════════════════════
//  COFFRE-FORT : dossiers + documents (métadonnées uniquement)
// ════════════════════════════════════════════════════════════════

db.exec('DELETE FROM documents');
db.exec("DELETE FROM sqlite_sequence WHERE name = 'documents'");
db.exec('DELETE FROM dossiers');
db.exec("DELETE FROM sqlite_sequence WHERE name = 'dossiers'");

const insertDossier = db.prepare(`
  INSERT INTO dossiers (nom, description, parent_id) VALUES (?, ?, ?)
`);
const dossierContrats  = insertDossier.run('Contrats',  'Contrats clients et fournisseurs', null).lastInsertRowid;
const dossierFactures  = insertDossier.run('Factures',  'Factures émises et reçues', null).lastInsertRowid;
const dossierRH        = insertDossier.run('RH',        'Documents liés au personnel', null).lastInsertRowid;
console.log('✅ 3 dossiers créés (Contrats, Factures, RH)');

const documents = [
  { nom: 'Contrat_prestation_Dupont_SAS.pdf',      nom_fichier: '1751000000000-Contrat_prestation_Dupont_SAS.pdf',      type: 'PDF',   taille: '482 KB', statut: 'Vérifié',  description: 'Contrat de prestation signé le 12/03/2026',        dossier_id: dossierContrats },
  { nom: 'Contrat_maintenance_ClientX_2026.pdf',    nom_fichier: '1751000000001-Contrat_maintenance_ClientX_2026.pdf',    type: 'PDF',   taille: '310 KB', statut: 'Traité',   description: 'Renouvellement annuel avec clause de reconduction', dossier_id: dossierContrats },
  { nom: 'Facture_2026-0142.pdf',                   nom_fichier: '1751000000002-Facture_2026-0142.pdf',                   type: 'PDF',   taille: '96 KB',  statut: 'Traité',   description: 'Facture client Chambre de Commerce',                dossier_id: dossierFactures },
  { nom: 'Facture_2026-0143.pdf',                   nom_fichier: '1751000000003-Facture_2026-0143.pdf',                   type: 'PDF',   taille: '104 KB', statut: 'Vérifié',  description: 'Facture client Dupont SAS',                         dossier_id: dossierFactures },
  { nom: 'Releve_TVA_T2_2026.xlsx',                 nom_fichier: '1751000000004-Releve_TVA_T2_2026.xlsx',                 type: 'Excel', taille: '58 KB',  statut: 'En cours', description: 'Déclaration de TVA du second trimestre',            dossier_id: dossierFactures },
  { nom: 'Contrat_travail_Thomas_Girard.pdf',       nom_fichier: '1751000000005-Contrat_travail_Thomas_Girard.pdf',       type: 'PDF',   taille: '215 KB', statut: 'Vérifié',  description: 'CDI signé le 10/01/2022',                           dossier_id: dossierRH },
  { nom: 'Bulletin_paie_juin_2026.pdf',             nom_fichier: '1751000000006-Bulletin_paie_juin_2026.pdf',             type: 'PDF',   taille: '72 KB',  statut: 'Traité',   description: 'Bulletins de paie du mois de juin',                 dossier_id: dossierRH },
];

const insertDocument = db.prepare(`
  INSERT INTO documents (nom, nom_fichier, type, taille, statut, description, dossier_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const d of documents) {
  insertDocument.run(d.nom, d.nom_fichier, d.type, d.taille, d.statut, d.description, d.dossier_id);
}
console.log(`✅ ${documents.length} documents créés (métadonnées uniquement, pas de fichiers physiques)`);

// ════════════════════════════════════════════════════════════════
//  PLANNING
// ════════════════════════════════════════════════════════════════

db.exec('DELETE FROM planning');
db.exec("DELETE FROM sqlite_sequence WHERE name = 'planning'");

const planning = [
  { employe: nomComplet.Julien,  offset: 1,  heure_debut: '09:00', heure_fin: '17:00', projet: 'Prospection Dupont SAS' },
  { employe: nomComplet.Sophie,  offset: 2,  heure_debut: '09:00', heure_fin: '12:30', projet: 'Clôture comptable juin' },
  { employe: nomComplet.Thomas,  offset: 3,  heure_debut: '10:00', heure_fin: '18:00', projet: 'Support client' },
  { employe: nomComplet.Camille, offset: 5,  heure_debut: '14:00', heure_fin: '16:00', projet: 'Réunion d\'équipe' },
  { employe: nomComplet.Julien,  offset: 8,  heure_debut: '09:00', heure_fin: '17:00', projet: 'Suivi Chambre de Commerce' },
  { employe: nomComplet.Sophie,  offset: 11, heure_debut: '09:00', heure_fin: '17:00', projet: 'Déclaration TVA T2' },
];

const insertPlanning = db.prepare(`
  INSERT INTO planning (employe, date, heure_debut, heure_fin, projet) VALUES (?, ?, ?, ?, ?)
`);
for (const p of planning) {
  insertPlanning.run(p.employe, isoDate(p.offset), p.heure_debut, p.heure_fin, p.projet);
}
console.log(`✅ ${planning.length} entrées de planning créées (réparties sur les 2 prochaines semaines)`);

// ════════════════════════════════════════════════════════════════
//  ÉVÉNEMENTS DU CALENDRIER
// ════════════════════════════════════════════════════════════════

db.exec('DELETE FROM evenements');
db.exec("DELETE FROM sqlite_sequence WHERE name = 'evenements'");

const evenements = [
  { titre: 'RDV client — Dupont SAS',            description: 'Présentation de la proposition commerciale',       offset: 1,  heure: 10, duree: 1,  type: 'rdv',      couleur: '#4f8cff', created_by: nomComplet.Julien },
  { titre: 'Échéance déclaration TVA',            description: 'Dépôt de la déclaration du 2e trimestre',           offset: 4,  heure: 9,  duree: 0,  type: 'rappel',   couleur: '#f7a53b', created_by: nomComplet.Sophie },
  { titre: 'Entretien annuel — Thomas Girard',    description: 'Bilan de fin d\'année et objectifs',                offset: 6,  heure: 15, duree: 1,  type: 'rdv',      couleur: '#4f8cff', created_by: nomComplet.Camille },
  { titre: 'Réunion d\'équipe hebdomadaire',       description: 'Point sur les objectifs Q3 et retours clients',     offset: 5,  heure: 14, duree: 1,  type: 'evenement', couleur: '#7c6af7', created_by: nomComplet.Camille },
  { titre: 'Relance clients impayés',              description: 'Appels de relance pour les factures en retard',     offset: 2,  heure: 11, duree: 1,  type: 'tache',    couleur: '#e05263', created_by: nomComplet.Sophie },
  { titre: 'Formation digitale — Chambre de Commerce', description: 'Présentation de nos services de formation',     offset: 9,  heure: 10, duree: 2,  type: 'rdv',      couleur: '#4f8cff', created_by: nomComplet.Julien },
];

const insertEvenement = db.prepare(`
  INSERT INTO evenements (titre, description, date_debut, date_fin, type, couleur, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const e of evenements) {
  const debut = isoDateTime(e.offset, e.heure);
  const fin   = isoDateTime(e.offset, e.heure + e.duree);
  insertEvenement.run(e.titre, e.description, debut, fin, e.type, e.couleur, e.created_by);
}
console.log(`✅ ${evenements.length} événements créés dans le calendrier`);

console.log('\n🌱 Seed terminé avec succès.');
console.log(`   Connexion démo : ${employes[0].email} / ${DEMO_PASSWORD} (admin)`);
