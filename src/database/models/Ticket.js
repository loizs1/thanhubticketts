import { getPool, getDb } from '../database.js';

// Query builder class for chaining
class TicketQuery {
  constructor(filter = {}) {
    this.filter = filter;
    this.sortField = 'openedAt';
    this.sortOrder = 'DESC';
    this.limitValue = filter.$limit || null;
  }

  sort(sortObj) {
    const field = Object.keys(sortObj)[0];
    if (field === 'ticketNumber') {
      this.sortField = 'ticketNumber';
    } else if (field === 'openedAt') {
      this.sortField = 'openedAt';
    } else {
      this.sortField = field;
    }
    this.sortOrder = sortObj[field] === -1 ? 'DESC' : 'ASC';
    return this;
  }

  limit(n) {
    this.limitValue = n;
    return this;
  }

  exec() {
    const db = getDb();
    let query = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    
    if (this.filter.guildId) {
      query += ' AND guildId = ?';
      params.push(this.filter.guildId);
    }
    if (this.filter.userId) {
      query += ' AND userId = ?';
      params.push(this.filter.userId);
    }
    if (this.filter.status) {
      // Handle $in operator for status
      if (this.filter.status.$in && Array.isArray(this.filter.status.$in)) {
        const placeholders = this.filter.status.$in.map(() => '?').join(', ');
        query += ` AND status IN (${placeholders})`;
        params.push(...this.filter.status.$in);
      } else {
        query += ' AND status = ?';
        params.push(this.filter.status);
      }
    }
    if (this.filter.category) {
      query += ' AND category = ?';
      params.push(this.filter.category);
    }
    if (this.filter.categoryId) {
      query += ' AND categoryId = ?';
      params.push(this.filter.categoryId);
    }
    if (this.filter.channelId) {
      query += ' AND channelId = ?';
      params.push(this.filter.channelId);
    }
    if (this.filter.assignedTo) {
      query += ' AND assignedTo = ?';
      params.push(this.filter.assignedTo);
    }
    if (this.filter.claimedBy) {
      query += ' AND claimedBy = ?';
      params.push(this.filter.claimedBy);
    }
    
    // Sorting from filter.$sort
    if (this.filter.$sort) {
      const sortField = Object.keys(this.filter.$sort)[0];
      if (sortField === 'ticketNumber') {
        this.sortField = 'ticketNumber';
      } else if (sortField === 'openedAt') {
        this.sortField = 'openedAt';
      } else {
        this.sortField = sortField;
      }
      this.sortOrder = this.filter.$sort[sortField] === -1 ? 'DESC' : 'ASC';
    }
    
    // Escape column names to avoid reserved keyword issues
    const escapedSortField = `"${this.sortField}"`;
    query += ` ORDER BY ${escapedSortField} ${this.sortOrder}`;
    
    if (this.limitValue) {
      query += ` LIMIT ${this.limitValue}`;
    }
    
    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(row => formatTicket(row));
  }

  then(resolve, reject) {
    try {
      const result = this.exec();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }

  first() {
    const results = this.exec();
    return results[0] || null;
  }
}

const Ticket = {
  // Find all tickets matching filter - returns query object for chaining
  find(filter = {}) {
    return new TicketQuery(filter);
  },

  // Find one ticket - returns query object for chaining (like TicketQuery)
  findOne(filter = {}) {
    return new TicketQuery(filter).limit(1);
  },

  // Find by ID
  findById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
    const row = stmt.get(id);
    return row ? formatTicket(row) : null;
  },

  // Find by channel ID
  findByChannelId(channelId) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM tickets WHERE channelId = ?');
    const row = stmt.get(channelId);
    return row ? formatTicket(row) : null;
  },

  // Create new ticket
  create(data) {
    const db = getDb();
    
    // Get next ticket number for this guild
    const maxNumStmt = db.prepare('SELECT MAX(ticketNumber) as maxNum FROM tickets WHERE guildId = ?');
    const maxResult = maxNumStmt.get(data.guildId);
    const ticketNumber = (maxResult?.maxNum || 0) + 1;
    
    const fields = {
      guildId: data.guildId,
      ticketNumber: ticketNumber,
      channelId: data.channelId,
      userId: data.userId,
      username: data.username,
      category: data.category,
      categoryId: data.categoryId || null,
      subject: data.subject,
      description: data.description || null,
      assignedTo: data.assignedTo || null,
      claimedBy: data.claimedBy || null,
      status: data.status || 'open',
      openedAt: new Date().toISOString(),
      closedAt: null,
      lastActivity: new Date().toISOString(),
      closedBy: null,
      closeReason: null,
      participants: JSON.stringify(data.participants || []),
      messageCount: data.messageCount || 0,
      transcriptUrl: data.transcriptUrl || null,
      transcriptPath: data.transcriptPath || null,
      priority: data.priority || 'normal',
      tags: JSON.stringify(data.tags || []),
      notes: data.notes || null
    };
    
    const columns = Object.keys(fields).join(', ');
    const placeholders = Object.keys(fields).map(() => '?').join(', ');
    const values = Object.values(fields);
    
    const insertStmt = db.prepare(`INSERT INTO tickets (${columns}) VALUES (${placeholders})`);
    const result = insertStmt.run(...values);
    
    // Return the created ticket data directly with ticketNumber
    return formatTicket({ ...fields, id: result.lastInsertRowid });
  },

  // Update ticket (supports MongoDB $set and $inc operators)
  updateOne(filter, update) {
    const db = getDb();
    const setData = update.$set ? { ...update.$set } : { ...update };
    delete setData.$inc;
    const incData = update.$inc || {};
    
    const updates = [];
    const values = [];
    
    // Handle $set operations
    for (const [key, value] of Object.entries(setData)) {
      if (key === 'participants' || key === 'tags') {
        updates.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else if (key === 'status' && value === 'closed') {
        updates.push('status = ?');
        values.push('closed');
        updates.push('closedAt = ?');
        values.push(new Date().toISOString());
      } else if (key === 'status' && value === 'reopened') {
        updates.push('status = ?');
        values.push('reopened');
        updates.push('reopenedAt = ?');
        values.push(new Date().toISOString());
      } else if (key === 'lastActivity') {
        updates.push('lastActivity = ?');
        values.push(new Date().toISOString());
      } else if (key === 'openedAt') {
        updates.push('openedAt = ?');
        values.push(value || new Date().toISOString());
      } else if (key === 'closedAt' && value === null) {
        updates.push('closedAt = NULL');
        // Don't add to values array since we're using NULL directly
        continue;
      } else {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    // Handle $inc operations (e.g., { $inc: { messageCount: 1 } })
    for (const [key, value] of Object.entries(incData)) {
      if (key === 'messageCount') {
        updates.push('messageCount = messageCount + ?');
        values.push(value);
      } else {
        updates.push(`${key} = ${key} + ?`);
        values.push(value);
      }
    }
    
    if (updates.length === 0) return;
    
    // Build WHERE clause
    let whereClause = 'id = ?';
    if (filter._id) {
      values.push(filter._id);
    } else if (filter.id) {
      values.push(filter.id);
    } else if (filter.channelId) {
      whereClause = 'channelId = ?';
      values.push(filter.channelId);
    } else if (filter.guildId && filter.ticketNumber) {
      whereClause = 'guildId = ? AND ticketNumber = ?';
      values.push(filter.guildId, filter.ticketNumber);
    }
    
    const query = `UPDATE tickets SET ${updates.join(', ')} WHERE ${whereClause}`;
    const stmt = db.prepare(query);
    stmt.run(...values);
  },

  // Delete ticket
  deleteOne(filter) {
    const db = getDb();
    let whereClause = 'id = ?';
    const values = [];
    
    if (filter._id) {
      values.push(filter._id);
    } else if (filter.id) {
      values.push(filter.id);
    } else if (filter.channelId) {
      whereClause = 'channelId = ?';
      values.push(filter.channelId);
    } else if (filter.guildId && filter.ticketNumber) {
      whereClause = 'guildId = ? AND ticketNumber = ?';
      values.push(filter.guildId, filter.ticketNumber);
    }
    
    const stmt = db.prepare(`DELETE FROM tickets WHERE ${whereClause}`);
    stmt.run(...values);
  },

  // Find by ID and update
  findByIdAndUpdate(id, update) {
    this.updateOne({ _id: id }, update);
    return this.findById(id);
  },

  // Find by channel ID and update
  findByChannelIdAndUpdate(channelId, update) {
    this.updateOne({ channelId }, update);
    return this.findByChannelId(channelId);
  },

  // Find by ID and delete
  findByIdAndDelete(id) {
    const ticket = this.findById(id);
    if (ticket) {
      this.deleteOne({ _id: id });
    }
    return ticket;
  },

  // Find one and update
  findOneAndUpdate(filter, update) {
    const ticket = this.findOne(filter).first();
    if (ticket) {
      this.updateOne(filter, update);
      return this.findOne(filter).first();
    }
    return null;
  },

  // Count tickets (supports MongoDB-style $in operator)
  countDocuments(filter = {}) {
    const db = getDb();
    let query = 'SELECT COUNT(*) as count FROM tickets WHERE 1=1';
    const params = [];
    
    if (filter.guildId) {
      query += ' AND guildId = ?';
      params.push(filter.guildId);
    }
    if (filter.userId) {
      query += ' AND userId = ?';
      params.push(filter.userId);
    }
    if (filter.status) {
      // Handle $in operator for status
      if (filter.status.$in && Array.isArray(filter.status.$in)) {
        const placeholders = filter.status.$in.map(() => '?').join(', ');
        query += ` AND status IN (${placeholders})`;
        params.push(...filter.status.$in);
      } else {
        query += ' AND status = ?';
        params.push(filter.status);
      }
    }
    if (filter.channelId) {
      query += ' AND channelId = ?';
      params.push(filter.channelId);
    }
    if (filter.assignedTo) {
      query += ' AND assignedTo = ?';
      params.push(filter.assignedTo);
    }
    if (filter.claimedBy) {
      query += ' AND claimedBy = ?';
      params.push(filter.claimedBy);
    }
    
    const stmt = db.prepare(query);
    const row = stmt.get(...params);
    return row.count;
  },

  // Alias for countDocuments
  count(filter = {}) {
    return this.countDocuments(filter);
  },

  // Get max ticket number
  getMaxTicketNumber(guildId) {
    const db = getDb();
    const stmt = db.prepare('SELECT MAX(ticketNumber) as maxNum FROM tickets WHERE guildId = ?');
    const row = stmt.get(guildId);
    return row?.maxNum || 0;
  }
};

// Helper to format ticket data
function formatTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id.toString(),
    guildId: row.guildId,
    ticketNumber: row.ticketNumber,
    channelId: row.channelId,
    userId: row.userId,
    username: row.username,
    category: row.category,
    categoryId: row.categoryId,
    subject: row.subject,
    description: row.description,
    assignedTo: row.assignedTo,
    claimedBy: row.claimedBy,
    status: row.status || 'open',
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    lastActivity: row.lastActivity,
    closedBy: row.closedBy,
    closeReason: row.closeReason,
    participants: JSON.parse(row.participants || '[]'),
    messageCount: row.messageCount,
    transcriptUrl: row.transcriptUrl,
    transcriptPath: row.transcriptPath,
    priority: row.priority,
    tags: JSON.parse(row.tags || '[]'),
    notes: row.notes,
    isActive: (row.status || 'open') !== 'closed'
  };
}

export default Ticket;
