INSERT INTO Stage (name, position, boardId) VALUES ('To do', 1, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('In progress', 2, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('Waiting', 3, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('Done', 4, (SELECT MIN(id) FROM Board));
