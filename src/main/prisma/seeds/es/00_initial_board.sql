-- Tableau par défaut. Une base neuve le crée dans la langue de l'interface, une base mise à jour
-- traduit celui de la migration add_boards tant qu'il est seul, puis la seed n'est plus rejouée
INSERT INTO Board (name, nameKey, position) SELECT 'Mi tablero', 'mi tablero', 0 WHERE NOT EXISTS (SELECT 1 FROM Board);
UPDATE Board SET name = 'Mi tablero', nameKey = 'mi tablero' WHERE nameKey = 'mon tableau' AND (SELECT COUNT(*) FROM Board) = 1;
