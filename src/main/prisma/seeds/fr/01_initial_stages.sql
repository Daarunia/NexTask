INSERT INTO Stage (name, position, boardId) VALUES ('A faire', 1, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('En cours', 2, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('En attente', 3, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('Terminé', 4, (SELECT MIN(id) FROM Board));
