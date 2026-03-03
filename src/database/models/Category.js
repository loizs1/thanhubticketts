import { getPool, getDb } from '../database.js';

// Query builder class for chaining
class CategoryQuery {
  constructor(filter = {}) {
    this.filter = filter;
    this.sortField = 'orderNum';
    this.sortOrder = 'ASC';
    this.limitValue = null;
  }

  sort(sortObj) {
    const field = Object.keys(sortObj)[0];
    // Map 'order' to 'orderNum' for database compatibility
    this.sortField = field === 'order' ? 'orderNum' : field;
    this.sortOrder = sortObj[field] === -1 ? 'DESC' : 'ASC';
    return this;
  }

  limit(n) {
    this.limitValue = n;
    return this;
  }

  exec() {
    const db = getDb();
    let query = 'SELECT * FROM categories WHERE 1=1';
    const params = [];
    
    if (this.filter.guildId) {
      query += ' AND guildId = ?';
      params.push(this.filter.guildId);
    }
    if (this.filter.isActive !== undefined) {
      query += ' AND isActive = ?';
      params.push(this.filter.isActive ? 1 : 0);
    }
    if (this.filter.name) {
      query += ' AND name = ?';
      params.push(this.filter.name);
    }
    if (this.filter._id) {
      query += ' AND id = ?';
      params.push(this.filter._id);
    }
    if (this.filter.id) {
      query += ' AND id = ?';
      params.push(this.filter.id);
    }
    
    // Escape column names to avoid reserved keyword issues
    const escapedSortField = `"${this.sortField}"`;
    query += ` ORDER BY ${escapedSortField} ${this.sortOrder}`;
    
    if (this.limitValue) {
      query += ` LIMIT ${this.limitValue}`;
    }
    
    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(row => formatCategory(row));
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

const Category = {
  // Find all categories matching filter - returns query object for chaining
  find(filter = {}) {
    return new CategoryQuery(filter);
  },

  // Find one category - returns query object for chaining
  findOne(filter = {}) {
    return new CategoryQuery(filter).limit(1);
  },

  // Find by ID
  findById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    const row = stmt.get(id);
    return row ? formatCategory(row) : null;
  },

  // Create new category
  create(data) {
    const db = getDb();
    
    const fields = {
      guildId: data.guildId,
      name: data.name,
      emoji: data.emoji || '🎟️',
      description: data.description || null,
      staffRoleIds: JSON.stringify(data.staffRoleIds || []),
      staffRoleId: data.staffRoleId || null,
      mentionOnCreate: data.mentionOnCreate ? 1 : 0,
      isActive: data.isActive !== undefined ? (data.isActive ? 1 : 1) : 1,
      staffOnly: data.staffOnly ? 1 : 0,
      categoryChannelId: data.categoryChannelId || null,
      modalFields: JSON.stringify(data.modalFields || []),
      ticketCount: data.ticketCount || 0,
      orderNum: data.orderNum || 0
    };
    
    const columns = Object.keys(fields).join(', ');
    const placeholders = Object.keys(fields).map(() => '?').join(', ');
    const values = Object.values(fields);
    
    try {
      const insertStmt = db.prepare(`INSERT INTO categories (${columns}) VALUES (${placeholders})`);
      const result = insertStmt.run(...values);
      return this.findById(result.lastInsertRowid);
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        // Update existing
        return this.findOneAndUpdate({ guildId: data.guildId, name: data.name }, { $set: data });
      }
      throw error;
    }
  },

  // Update category
  updateOne(filter, update) {
    const db = getDb();
    const setData = update.$set || {};
    const incData = update.$inc || {};
    
    const updates = [];
    const values = [];
    
    // Handle $set operations
    for (const [key, value] of Object.entries(setData)) {
      if (key === 'staffRoleIds' || key === 'modalFields') {
        updates.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else if (key === 'isActive' || key === 'staffOnly' || key === 'mentionOnCreate') {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else if (key === 'ticketCount' || key === 'orderNum') {
        updates.push(`${key} = ?`);
        values.push(value);
      } else {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    // Handle $inc operations (e.g., { $inc: { ticketCount: 1 } })
    for (const [key, value] of Object.entries(incData)) {
      updates.push(`${key} = ${key} + ?`);
      values.push(value);
    }
    
    if (updates.length === 0) return;
    
    // Build WHERE clause
    let whereClause = 'id = ?';
    if (filter._id) {
      values.push(filter._id);
    } else if (filter.id) {
      values.push(filter.id);
    } else if (filter.guildId && filter.name) {
      whereClause = 'guildId = ? AND name = ?';
      values.push(filter.guildId, filter.name);
    }
    
    const query = `UPDATE categories SET ${updates.join(', ')} WHERE ${whereClause}`;
    const stmt = db.prepare(query);
    stmt.run(...values);
  },

  // Find one and update
  findOneAndUpdate(filter, update) {
    const category = this.findOne(filter).first();
    if (category) {
      this.updateOne(filter, update);
      return this.findOne(filter).first();
    }
    return null;
  },

  // Find by ID and update
  findByIdAndUpdate(id, update) {
    this.updateOne({ _id: id }, update);
    return this.findById(id);
  },

  // Find by ID and delete
  findByIdAndDelete(id) {
    const db = getDb();
    const category = this.findById(id);
    if (category) {
      const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
      stmt.run(id);
    }
    return category;
  },

  // Find one and delete
  findOneAndDelete(filter) {
    const db = getDb();
    const category = this.findOne(filter).first();
    if (category) {
      const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
      stmt.run(category.id);
    }
    return category;
  },

  // Delete one
  deleteOne(filter) {
    const db = getDb();
    let whereClause = 'id = ?';
    const values = [];
    
    if (filter._id) {
      values.push(filter._id);
    } else if (filter.id) {
      values.push(filter.id);
    } else if (filter.guildId && filter.name) {
      whereClause = 'guildId = ? AND name = ?';
      values.push(filter.guildId, filter.name);
    }
    
    const stmt = db.prepare(`DELETE FROM categories WHERE ${whereClause}`);
    stmt.run(...values);
  },

  // Count categories
  countDocuments(filter = {}) {
    const db = getDb();
    let query = 'SELECT COUNT(*) as count FROM categories WHERE 1=1';
    const params = [];
    
    if (filter.guildId) {
      query += ' AND guildId = ?';
      params.push(filter.guildId);
    }
    if (filter.isActive !== undefined) {
      query += ' AND isActive = ?';
      params.push(filter.isActive ? 1 : 0);
    }
    
    const stmt = db.prepare(query);
    const row = stmt.get(...params);
    return row.count;
  },

  // Alias for countDocuments
  count(filter = {}) {
    return this.countDocuments(filter);
  }
};

// Helper to format category data
function formatCategory(row) {
  if (!row) return null;
  return {
    ...row,
    staffRoleIds: JSON.parse(row.staffRoleIds || '[]'),
    modalFields: JSON.parse(row.modalFields || '[]'),
    isActive: row.isActive === 1,
    staffOnly: row.staffOnly === 1,
    mentionOnCreate: row.mentionOnCreate === 1,
    _id: row.id.toString()
  };
}

export default Category;
