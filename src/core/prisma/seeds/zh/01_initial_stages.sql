INSERT INTO Stage (name, position, boardId) VALUES ('待办', 1, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('进行中', 2, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('等待中', 3, (SELECT MIN(id) FROM Board));
INSERT INTO Stage (name, position, boardId) VALUES ('已完成', 4, (SELECT MIN(id) FROM Board));
