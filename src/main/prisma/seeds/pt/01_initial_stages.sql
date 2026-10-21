INSERT INTO Stage (name, position, boardId) VALUES ('A fazer', 1, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('Em andamento', 2, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('Em espera', 3, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('Concluído', 4, (SELECT MIN(id) FROM Board));
