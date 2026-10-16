-- Modèles de checklist donnés en exemple. Un modèle déjà présent sous ce nom est laissé tel quel,
-- et les points ne vont que dans un modèle encore vide, donc les seeds peuvent être rejouées
INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, 'Préparer une release', 'préparer une release', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('Mettre à jour le changelog', 0),
  ('Passer le numéro de version', 1),
  ('Lancer la suite de tests complète', 2),
  ('Créer le tag de la version', 3),
  ('Publier les notes de version', 4)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = 'préparer une release'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);

INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, 'Revue de code', 'revue de code', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('Relire la description de la demande', 0),
  ('Vérifier que les tests couvrent le changement', 1),
  ('Contrôler la gestion des erreurs', 2),
  ('Relever les noms peu clairs', 3)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = 'revue de code'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);
