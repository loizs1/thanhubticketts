import initSqlJs from 'sql.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;
let dbPath = null;

// Compatibility wrapper to make sql.js work like better-sqlite3
class DbWrapper {
  constructor(database) {
    this.db = database;
  }

  prepare(sql) {
    return new StatementWrapper(this.db, sql);
  }

  exec(sql) {
    this.db.run(sql);
    saveDatabase();
  }

  pragma(pragma) {
    this.db.run(`PRAGMA ${pragma}`);
  }
}

// Wrapper for prepared statements to mimic better-sqlite3 API
class StatementWrapper {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.stmt = db.prepare(sql);
  }

  all(...params) {
    const rows = [];
    if (params.length > 0) {
      this.stmt.bind(params);
    }
    while (this.stmt.step()) {
      rows.push(this.stmt.getAsObject());
    }
    this.stmt.free();
    return rows;
  }

  get(...params) {
    if (params.length > 0) {
      this.stmt.bind(params);
    }
    const row = this.stmt.step() ? this.stmt.getAsObject() : null;
    this.stmt.free();
    return row;
  }

  run(...params) {
    if (params.length > 0) {
      this.stmt.bind(params);
    }
    this.stmt.step();
    const lastId = this.db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] || 0;
    const changes = this.db.getRowsModified();
    this.stmt.free();
    saveDatabase();
    return { lastInsertRowid: lastId, changes: changes };
  }

  bind(params) {
    this.stmt.bind(params);
    return this;
  }

  step() {
    return this.stmt.step();
  }

  getAsObject() {
    return this.stmt.getAsObject();
  }

  free() {
    this.stmt.free();
  }
}

function saveDatabase() {
  if (db && dbPath) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
      console.log(chalk.gray(`[DB] Database saved to ${path.basename(dbPath)} (${buffer.length} bytes)`));
    } catch (error) {
      console.error(chalk.red(`[DB] Failed to save database: ${error.message}`));
    }
  }
}

export function getPool() {
  // For compatibility with existing code, return an object with execute method
  return {
    execute: async (sql, params = []) => {
      if (!db) throw new Error('Database not connected');

      // Convert MySQL-style ? placeholders to SQLite $1, $2, etc.
      let sqliteSql = sql;
      let paramIndex = 1;
      while (sqliteSql.includes('?')) {
        sqliteSql = sqliteSql.replace('?', `$${paramIndex}`);
        paramIndex++;
      }

      // Handle different query types
      if (sql.trim().toLowerCase().startsWith('select')) {
        const stmt = db.prepare(sqliteSql);
        if (params.length > 0) {
          stmt.bind(params);
        }
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return [rows];
      } else if (sql.trim().toLowerCase().startsWith('insert')) {
        const stmt = db.prepare(sqliteSql);
        if (params.length > 0) {
          stmt.bind(params);
        }
        stmt.step();
        const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] || 0;
        const changes = db.getRowsModified();
        stmt.free();
        saveDatabase();
        return [{ insertId: lastId, affectedRows: changes }];
      } else {
        const stmt = db.prepare(sqliteSql);
        if (params.length > 0) {
          stmt.bind(params);
        }
        stmt.step();
        const changes = db.getRowsModified();
        stmt.free();
        saveDatabase();
        return [{ affectedRows: changes }];
      }
    }
  };
}

export function getDb() {
  return db ? new DbWrapper(db) : null;
}

export async function connectDatabase() {
  dbPath = path.join(process.cwd(), 'database.sqlite');

  console.log(chalk.gray(`  Connecting to SQLite at ${dbPath}...`));

  try {
    // Initialize sql.js
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log(chalk.green('✓ SQLite connected (existing database loaded)\n'));
    } else {
      db = new SQL.Database();
      console.log(chalk.green('✓ SQLite connected (new database created)\n'));
    }

    // Initialize tables
    initializeTables();

    return new DbWrapper(db);
  } catch (error) {
    console.error(chalk.red('✗ SQLite connection failed:'), error.message);
    process.exit(1);
  }
}

function initializeTables() {
  console.log(chalk.yellow('  Initializing database tables...'));

  try {
    // Create categories table
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT DEFAULT '🎟️',
        description TEXT,
        staffRoleIds TEXT,
        staffRoleId TEXT,
        mentionOnCreate INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        staffOnly INTEGER DEFAULT 0,
        categoryChannelId TEXT,
        modalFields TEXT,
        ticketCount INTEGER DEFAULT 0,
        orderNum INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guildId, name)
      )
    `);

    // Create trigger for updatedAt
    db.run(`
      CREATE TRIGGER IF NOT EXISTS categories_updatedAt 
      AFTER UPDATE ON categories
      BEGIN
        UPDATE categories SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    console.log(chalk.green('  ✓ Categories table ready'));

    // Create configs table
    db.run(`
      CREATE TABLE IF NOT EXISTS configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT NOT NULL UNIQUE,
        ticketCategoryId TEXT,
        createTicketChannelId TEXT,
        ticketLogChannelId TEXT,
        transcriptChannelId TEXT,
        staffRoleId TEXT,
        adminRoleId TEXT,
        maxTicketsPerUser INTEGER DEFAULT 3,
        autoCloseEnabled INTEGER DEFAULT 0,
        autoCloseDays INTEGER DEFAULT 7,
        autoCloseWarningDays INTEGER DEFAULT 5,
        ticketNameFormat TEXT DEFAULT '{category}-{number}',
        welcomeMessage TEXT,
        closeMessage TEXT,
        transcriptsEnabled INTEGER DEFAULT 1,
        claimEnabled INTEGER DEFAULT 1,
        ratingsEnabled INTEGER DEFAULT 0,
        panelMessageId TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trigger for updatedAt
    db.run(`
      CREATE TRIGGER IF NOT EXISTS configs_updatedAt 
      AFTER UPDATE ON configs
      BEGIN
        UPDATE configs SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    console.log(chalk.green('  ✓ Configs table ready'));

    // Migration: Add points columns if they don't exist
    try {
      db.run(`ALTER TABLE configs ADD COLUMN pointsEnabled INTEGER DEFAULT 1`);
      db.run(`ALTER TABLE configs ADD COLUMN pointsOnClose INTEGER DEFAULT 1`);
      console.log(chalk.green('  ✓ Points config columns added'));
    } catch (e) {
      // Columns might already exist, ignore
      if (!e.message.includes('duplicate column name')) {
        console.log(chalk.gray('  ℹ Points config columns already exist or migration skipped'));
      }
    }

    // Migration: Add panel customization columns if they don't exist
    const panelColumns = [
      { name: 'panelTitle', default: 'Support Ticket System' },
      { name: 'panelDescription', default: 'Select a category below to create a new support ticket.\\n\\nOur staff team will assist you as soon as possible!' },
      { name: 'panelColor', default: '#5865F2' },
      { name: 'panelThumbnail', default: null },
      { name: 'panelImage', default: null },
      { name: 'panelFooter', default: null },
      { name: 'panelPlaceholder', default: 'Select a category...' }
    ];

    for (const col of panelColumns) {
      try {
        const defaultValue = col.default === null ? 'NULL' : `'${col.default}'`;
        db.run(`ALTER TABLE configs ADD COLUMN ${col.name} TEXT DEFAULT ${defaultValue}`);
        console.log(chalk.green(`  ✓ Panel column ${col.name} added`));
      } catch (e) {
        if (!e.message.includes('duplicate column name')) {
          console.log(chalk.gray(`  ℹ Panel column ${col.name} already exists`));
        }
      }
    }

    // Create tickets table
    db.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT NOT NULL,
        ticketNumber INTEGER NOT NULL,
        channelId TEXT NOT NULL UNIQUE,
        userId TEXT NOT NULL,
        username TEXT NOT NULL,
        category TEXT NOT NULL,
        categoryId INTEGER,
        subject TEXT NOT NULL,
        description TEXT,
        assignedTo TEXT,
        claimedBy TEXT,
        status TEXT DEFAULT 'open',
        openedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        closedAt DATETIME,
        lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
        closedBy TEXT,
        closeReason TEXT,
        reopenedAt DATETIME,
        reopenedBy TEXT,
        participants TEXT,
        messageCount INTEGER DEFAULT 0,
        transcriptUrl TEXT,
        transcriptPath TEXT,
        priority TEXT DEFAULT 'normal',
        tags TEXT,
        notes TEXT,
        customFields TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guildId)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channelId)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(userId, status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, openedAt)`);

    // Create trigger for updatedAt
    db.run(`
      CREATE TRIGGER IF NOT EXISTS tickets_updatedAt 
      AFTER UPDATE ON tickets
      BEGIN
        UPDATE tickets SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    console.log(chalk.green('  ✓ Tickets table ready'));

    // Create staff_points table for leaderboard
    db.run(`
      CREATE TABLE IF NOT EXISTS staff_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        username TEXT NOT NULL,
        points INTEGER DEFAULT 0,
        ticketsClosed INTEGER DEFAULT 0,
        ticketsClaimed INTEGER DEFAULT 0,
        ticketsReopened INTEGER DEFAULT 0,
        lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guildId, userId)
      )
    `);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_staff_points_guild ON staff_points(guildId)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_staff_points_points ON staff_points(points DESC)`);

    console.log(chalk.green('  ✓ Staff Points table ready'));

    // Save the database after creating tables
    saveDatabase();

    console.log(chalk.green('  ✓ All tables ready (data preserved)\n'));
  } catch (error) {
    console.error(chalk.red('  ✗ Error initializing tables:'), error.message);
    throw error;
  }
}

// Helper function to save database after modifications
export function saveDb() {
  saveDatabase();
}

export default {
  connectDatabase,
  getPool,
  getDb,
  saveDb
};
