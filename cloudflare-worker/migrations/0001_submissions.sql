-- No expiry. Only an administrator may release a delivered/uncertain identity.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY NOT NULL,
  discord_user_id TEXT NOT NULL UNIQUE,
  discord_username TEXT NOT NULL,
  minecraft_username TEXT NOT NULL,
  minecraft_username_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'delivered', 'uncertain')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  CHECK (minecraft_username_normalized = lower(minecraft_username)),
  CHECK (length(minecraft_username) BETWEEN 3 AND 16)
);
