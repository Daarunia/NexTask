-- Modèles de checklist donnés en exemple. Un modèle déjà présent sous ce nom est laissé tel quel,
-- et les points ne vont que dans un modèle encore vide, donc les seeds peuvent être rejouées
INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, '准备发布', '准备发布', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('更新变更日志', 0),
  ('更新版本号', 1),
  ('运行完整测试', 2),
  ('创建版本标签', 3),
  ('发布版本说明', 4)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = '准备发布'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);

INSERT OR IGNORE INTO Checklist (taskId, name, nameKey, position, createdAt, updatedAt)
SELECT NULL, '代码审查', '代码审查', COALESCE(MAX(position) + 1, 0), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM Checklist WHERE taskId IS NULL;

INSERT INTO ChecklistItem (text, position, isChecked, checklistId)
SELECT item.column1, item.column2, 0, template.id
FROM Checklist AS template, (VALUES
  ('阅读需求说明', 0),
  ('确认测试覆盖了改动', 1),
  ('检查错误处理', 2),
  ('指出不清晰的命名', 3)
) AS item
WHERE template.taskId IS NULL AND template.nameKey = '代码审查'
  AND NOT EXISTS (SELECT 1 FROM ChecklistItem WHERE checklistId = template.id);
