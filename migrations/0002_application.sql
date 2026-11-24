CREATE TABLE subscriptions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL, plan TEXT NOT NULL CHECK(plan IN ('free','plus','pro')),
 status TEXT NOT NULL, paid_through TEXT, event_at TEXT NOT NULL
);
CREATE INDEX subscriptions_user ON subscriptions(user_id,status,paid_through);
CREATE TABLE checkout_intents (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,created_at TEXT NOT NULL);
CREATE INDEX checkout_user ON checkout_intents(user_id);
CREATE TABLE webhook_events (id TEXT PRIMARY KEY,occurred_at TEXT NOT NULL,received_at TEXT NOT NULL);
CREATE INDEX webhook_retention ON webhook_events(received_at);
CREATE TABLE profiles (id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,data TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(id,user_id));
CREATE TABLE run_summaries (id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,user_id));
CREATE INDEX run_user_date ON run_summaries(user_id,created_at);
CREATE TABLE api_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX api_limits_expiry ON api_limits(expires_at);
