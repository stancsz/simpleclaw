import Database from 'better-sqlite3';
import { join } from 'path';

// Using a local file for the database
const dbPath = join(process.cwd(), 'local.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT,
    platform TEXT,
    config TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Mock user for local mode
const LOCAL_USER_ID = 'local-user-id';
const LOCAL_USER_EMAIL = 'admin@local.test';

// Ensure local user exists
const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(LOCAL_USER_ID);
if (!userExists) {
  db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(LOCAL_USER_ID, LOCAL_USER_EMAIL);
}

export { db, LOCAL_USER_ID, LOCAL_USER_EMAIL };
