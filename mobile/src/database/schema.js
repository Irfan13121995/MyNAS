/**
 * SQLite Database Schema for Personal NAS
 * Offline-First Architecture & Sync Queue Management
 */

export const DATABASE_NAME = 'personal_nas_v2.db';

export const CREATE_TABLES_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- 1. File Metadata & Sync Queue Table
  CREATE TABLE IF NOT EXISTS files_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    local_uri TEXT NOT NULL,
    media_type TEXT DEFAULT 'photo', -- 'photo', 'video', 'document', 'audio', 'other'
    file_size INTEGER DEFAULT 0,
    duration REAL DEFAULT 0,
    creation_time INTEGER,
    file_hash TEXT,
    sync_status TEXT DEFAULT 'pending', -- 'pending', 'syncing', 'completed', 'failed'
    remote_path TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    last_synced_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  -- Indexes for fast querying & queue processing
  CREATE INDEX IF NOT EXISTS idx_files_sync_status ON files_metadata (sync_status);
  CREATE INDEX IF NOT EXISTS idx_files_creation_time ON files_metadata (creation_time DESC);
  CREATE INDEX IF NOT EXISTS idx_files_asset_id ON files_metadata (asset_id);
  CREATE INDEX IF NOT EXISTS idx_files_file_hash ON files_metadata (file_hash);

  -- 2. App & Sync Settings
  CREATE TABLE IF NOT EXISTS sync_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  -- 3. Sync Activity Logs (Audit Trail)
  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL, -- 'scan', 'upload_start', 'upload_success', 'upload_error', 'bg_task'
    message TEXT NOT NULL,
    details TEXT,
    timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_sync_logs_timestamp ON sync_logs (timestamp DESC);
`;
