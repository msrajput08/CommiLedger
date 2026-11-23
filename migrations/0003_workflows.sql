CREATE TABLE workflows (
 id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 data TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(id,user_id)
);
