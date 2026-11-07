-- Modèles de checklist donnés en exemple. Un modèle déjà présent sous ce nom est laissé tel quel,
-- et les points ne vont que dans un modèle encore vide, donc les seeds peuvent être rejouées
INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, 'Preparar una versión', 'preparar una versión', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('Actualizar el registro de cambios', 0),
  ('Subir el número de versión', 1),
  ('Ejecutar todas las pruebas', 2),
  ('Crear la etiqueta de la versión', 3),
  ('Publicar las notas de la versión', 4)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = 'preparar una versión'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);

INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, 'Revisión de código', 'revisión de código', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('Leer la descripción de la solicitud', 0),
  ('Comprobar que las pruebas cubren el cambio', 1),
  ('Revisar el manejo de errores', 2),
  ('Señalar los nombres poco claros', 3)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = 'revisión de código'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);
