import Database from 'better-sqlite3'

const DB_PATH = process.env.DB_PATH || '/data/forge.db'
const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id),
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'status')),
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_msg_proj ON messages(project_id, created_at);

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    status TEXT DEFAULT 'running',
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    result TEXT
  );
`)

// Helper: get or create a project (auto-creates if webhook triggers before UI)
export function ensureProject(id, displayName) {
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  if (existing) return existing
  db.prepare('INSERT INTO projects (id, display_name) VALUES (?, ?)').run(id, displayName || id)
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

export default db
