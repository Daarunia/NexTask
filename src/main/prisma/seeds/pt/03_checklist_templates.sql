-- Modèles de checklist donnés en exemple. Un modèle déjà présent sous ce nom est laissé tel quel,
-- et les points ne vont que dans un modèle encore vide, donc les seeds peuvent être rejouées
INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, 'Preparar uma versão', 'preparar uma versão', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('Atualizar o registro de alterações', 0),
  ('Subir o número da versão', 1),
  ('Executar todos os testes', 2),
  ('Criar a tag da versão', 3),
  ('Publicar as notas da versão', 4)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = 'preparar uma versão'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);

INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, 'Revisão de código', 'revisão de código', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('Ler a descrição da solicitação', 0),
  ('Verificar se os testes cobrem a alteração', 1),
  ('Revisar o tratamento de erros', 2),
  ('Apontar nomes pouco claros', 3)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = 'revisão de código'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);
