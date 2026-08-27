/**
 * SQLite Database Connection & Initialization
 * Expo SDK 57 (expo-sqlite modern async API)
 */
import * as SQLite from 'expo-sqlite';
import { DATABASE_NAME, CREATE_TABLES_SQL } from './schema';

let dbInstance = null;

/**
 * Open or retrieve the existing SQLite database instance
 */
export async function getDatabase() {
  if (dbInstance) return dbInstance;
  try {
    dbInstance = await SQLite.openDatabaseAsync(DATABASE_NAME);
    return dbInstance;
  } catch (error) {
    console.error('[DB] Failed to open SQLite database:', error);
    throw error;
  }
}

/**
 * Initialize SQLite database schema and default settings
 */
export async function initDatabase() {
  try {
    const db = await getDatabase();
    await db.execAsync(CREATE_TABLES_SQL);

    // Seed default sync settings if not present
    const defaultSettings = [
      ['auto_sync_enabled', 'true'],
      ['sync_on_wifi_only', 'false'],
      ['sync_on_charging_only', 'false'],
      ['sync_interval_minutes', '15'],
      ['destination_folder', 'Mobile Backups'],
      ['server_url', 'https://mynas-hi.online'],
      ['max_retries', '5']
    ];

    for (const [key, value] of defaultSettings) {
      await db.runAsync(
        `INSERT OR IGNORE INTO sync_settings (key, value, updated_at) VALUES (?, ?, ?)`,
        [key, value, Date.now()]
      );
    }

    console.log('[DB] SQLite Database initialized successfully.');
    return db;
  } catch (error) {
    console.error('[DB] Database initialization error:', error);
    throw error;
  }
}
