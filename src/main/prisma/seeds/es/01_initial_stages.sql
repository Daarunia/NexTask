INSERT INTO Stage (name, position, boardId) VALUES ('Por hacer', 1, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('En curso', 2, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('En espera', 3, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('Hecho', 4, (SELECT MIN(id) FROM Board));
