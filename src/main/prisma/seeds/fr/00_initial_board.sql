-- Tableau par défaut. Une base neuve le crée dans la langue de l'interface, une base mise à jour
-- traduit celui de la migration add_boards tant qu'il est seul, puis la seed n'est plus rejouée
INSERT INTO Board (name, nameKey, position) SELECT 'Mon tableau', 'mon tableau', 0 WHERE NOT EXISTS (SELECT 1 FROM Board);
UPDATE Board SET name = 'Mon tableau', nameKey = 'mon tableau' WHERE nameKey = 'mon tableau' AND (SELECT COUNT(*) FROM Board) = 1;
