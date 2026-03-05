import { getPool, getDb } from '../database.js';

const Config = {
  // Find config - returns array
  find(filter = {}) {
    const db = getDb();
    let query = 'SELECT * FROM configs WHERE 1=1';
    const params = [];

    if (filter.guildId) {
      query += ' AND guildId = ?';
      params.push(filter.guildId);
    }

    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    const formatted = rows.map(row => formatConfig(row));
    console.log(`[DB:Config] find found ${formatted.length} entries for ${JSON.stringify(filter)}`);
    return formatted;
  },

  // Find one config
  findOne(filter = {}) {
    const db = getDb();
    let query = 'SELECT * FROM configs WHERE 1=1';
    const params = [];

    if (filter.guildId) {
      query += ' AND guildId = ?';
      params.push(filter.guildId);
    }

    query += ' LIMIT 1';
    const stmt = db.prepare(query);
    const row = stmt.get(...params);
    const formatted = row ? formatConfig(row) : null;
    console.log(`[DB:Config] findOne ${formatted ? 'FOUND' : 'NOT FOUND'} for ${JSON.stringify(filter)}`);
    return formatted;
  },

  // Find by ID
  findById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM configs WHERE id = ?');
    const row = stmt.get(id);
    return row ? formatConfig(row) : null;
  },

  // Create new config
  create(data) {
    const db = getDb();

    const fields = {
      guildId: data.guildId,
      ticketCategoryId: data.ticketCategoryId || null,
      createTicketChannelId: data.createTicketChannelId || null,
      ticketLogChannelId: data.ticketLogChannelId || null,
      transcriptChannelId: data.transcriptChannelId || null,
      staffRoleId: data.staffRoleId || null,
      adminRoleId: data.adminRoleId || null,
      maxTicketsPerUser: data.maxTicketsPerUser || 3,
      autoCloseEnabled: data.autoCloseEnabled ? 1 : 0,
      autoCloseDays: data.autoCloseDays || 7,
      autoCloseWarningDays: data.autoCloseWarningDays || 5,
      ticketNameFormat: data.ticketNameFormat || '{category}-{number}',
      welcomeMessage: data.welcomeMessage || null,
      closeMessage: data.closeMessage || null,
      transcriptsEnabled: data.transcriptsEnabled !== undefined ? (data.transcriptsEnabled ? 1 : 0) : 1,
      claimEnabled: data.claimEnabled !== undefined ? (data.claimEnabled ? 1 : 0) : 1,
      ratingsEnabled: data.ratingsEnabled ? 1 : 0,
      panelMessageId: data.panelMessageId || null,
      pointsEnabled: data.pointsEnabled !== undefined ? (data.pointsEnabled ? 1 : 0) : 1,
      pointsOnClose: data.pointsOnClose || 1,
      // Panel customization fields
      panelTitle: data.panelTitle || null,
      panelDescription: data.panelDescription || null,
      panelColor: data.panelColor || null,
      panelThumbnail: data.panelThumbnail || null,
      panelImage: data.panelImage || null,
      panelFooter: data.panelFooter || null,
      panelPlaceholder: data.panelPlaceholder || null
    };

    const columns = Object.keys(fields).join(', ');
    const placeholders = Object.keys(fields).map(() => '?').join(', ');
    const values = Object.values(fields);

    try {
      console.log(`[DB:Config] Creating new config for guild ${data.guildId}`);
      const insertStmt = db.prepare(`INSERT INTO configs (${columns}) VALUES (${placeholders})`);
      const result = insertStmt.run(...values);
      return this.findById(result.lastInsertRowid);
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        // Update existing
        return this.findOneAndUpdate({ guildId: data.guildId }, { $set: data });
      }
      throw error;
    }
  },

  // Update config
  updateOne(filter, update) {
    const db = getDb();
    const setData = update.$set || update;

    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(setData)) {
      if (key === '$set') continue; // Skip if accidentally passed

      if (['autoCloseEnabled', 'transcriptsEnabled', 'claimEnabled', 'ratingsEnabled', 'pointsEnabled'].includes(key)) {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) return;

    // Build WHERE clause
    let whereClause = '';
    const whereValues = [];

    if (filter.id || filter._id) {
      whereClause = 'id = ?';
      whereValues.push(filter.id || filter._id);
    } else if (filter.guildId) {
      whereClause = 'guildId = ?';
      whereValues.push(filter.guildId);
    } else {
      throw new Error('Update requires a filter with id or guildId');
    }

    const query = `UPDATE configs SET ${updates.join(', ')} WHERE ${whereClause}`;
    const stmt = db.prepare(query);
    stmt.run(...values, ...whereValues);
  },

  // Find one and update (returns the updated document)
  findOneAndUpdate(filter, update) {
    const config = this.findOne(filter);
    if (config) {
      this.updateOne(filter, update);
      return this.findOne(filter);
    }
    return null;
  },

  // Find one and upsert
  findOneAndUpsert(filter, update) {
    const existing = this.findOne(filter);
    if (existing) {
      this.updateOne(filter, update);
      return this.findOne(filter);
    } else {
      return this.create({ ...filter, ...(update.$set || update) });
    }
  },

  // Legacy Mongoose methods
  findByIdAndUpdate(id, update) {
    this.updateOne({ _id: id }, update);
    return this.findById(id);
  },

  findOneAndDelete(filter) {
    const db = getDb();
    const config = this.findOne(filter);
    if (config) {
      const stmt = db.prepare('DELETE FROM configs WHERE guildId = ?');
      stmt.run(filter.guildId);
    }
    return config;
  }
};

// Helper to format config data
function formatConfig(row) {
  if (!row) return null;

  const formatted = {
    ...row,
    id: row.id,
    guildId: row.guildId,
    ticketCategoryId: row.ticketCategoryId,
    createTicketChannelId: row.createTicketChannelId,
    ticketLogChannelId: row.ticketLogChannelId,
    transcriptChannelId: row.transcriptChannelId,
    staffRoleId: row.staffRoleId,
    adminRoleId: row.adminRoleId,
    maxTicketsPerUser: row.maxTicketsPerUser,
    autoCloseEnabled: Boolean(row.autoCloseEnabled),
    autoCloseDays: row.autoCloseDays,
    autoCloseWarningDays: row.autoCloseWarningDays,
    ticketNameFormat: row.ticketNameFormat,
    welcomeMessage: row.welcomeMessage,
    closeMessage: row.closeMessage,
    transcriptsEnabled: row.transcriptsEnabled !== 0,
    claimEnabled: row.claimEnabled !== 0,
    ratingsEnabled: Boolean(row.ratingsEnabled),
    panelMessageId: row.panelMessageId,
    pointsEnabled: row.pointsEnabled !== 0,
    pointsOnClose: row.pointsOnClose || 1,
    // Panel customization fields
    panelTitle: row.panelTitle,
    panelDescription: row.panelDescription,
    panelColor: row.panelColor,
    panelThumbnail: row.panelThumbnail,
    panelImage: row.panelImage,
    panelFooter: row.panelFooter,
    panelPlaceholder: row.panelPlaceholder,
    _id: row.id.toString()
  };

  return formatted;
}

export default Config;
