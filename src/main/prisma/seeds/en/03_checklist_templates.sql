-- Modèles de checklist donnés en exemple. Un modèle déjà présent sous ce nom est laissé tel quel,
-- et les points ne vont que dans un modèle encore vide, donc les seeds peuvent être rejouées
INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, 'Prepare a release', 'prepare a release', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('Update the changelog', 0),
  ('Bump the version number', 1),
  ('Run the full test suite', 2),
  ('Create the version tag', 3),
  ('Publish the release notes', 4)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = 'prepare a release'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);

INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, 'Code review', 'code review', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('Read the request description', 0),
  ('Check that tests cover the change', 1),
  ('Review error handling', 2),
  ('Flag unclear names', 3)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = 'code review'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);
