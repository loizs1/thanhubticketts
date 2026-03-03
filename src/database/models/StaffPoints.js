import { getDb } from '../database.js';

const StaffPoints = {
  // Add or update staff points
  async addPoints(guildId, userId, username, points, action = 'points') {
    const db = getDb();
    
    // Check if user exists
    const existing = db.prepare('SELECT * FROM staff_points WHERE guildId = ? AND userId = ?').get(guildId, userId);
    
    if (existing) {
      // Update existing
      let updateFields = 'points = points + ?, lastUpdated = CURRENT_TIMESTAMP';
      
      if (action === 'close') {
        updateFields += ', ticketsClosed = ticketsClosed + 1';
      } else if (action === 'claim') {
        updateFields += ', ticketsClaimed = ticketsClaimed + 1';
      } else if (action === 'reopen') {
        updateFields += ', ticketsReopened = ticketsReopened + 1';
      }
      
      db.prepare(`UPDATE staff_points SET ${updateFields} WHERE guildId = ? AND userId = ?`).run(points, guildId, userId);
    } else {
      // Insert new
      let ticketsClosed = action === 'close' ? 1 : 0;
      let ticketsClaimed = action === 'claim' ? 1 : 0;
      let ticketsReopened = action === 'reopen' ? 1 : 0;
      
      db.prepare(
        `INSERT INTO staff_points (guildId, userId, username, points, ticketsClosed, ticketsClaimed, ticketsReopened) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(guildId, userId, username, points, ticketsClosed, ticketsClaimed, ticketsReopened);
    }
  },
  
  // Get leaderboard for a guild with pagination support
  async getLeaderboard(guildId, limit = 10, offset = 0) {
    const db = getDb();
    const stmt = db.prepare(`SELECT * FROM staff_points WHERE guildId = ? ORDER BY points DESC LIMIT ? OFFSET ?`);
    const rows = stmt.all(guildId, limit, offset);
    return rows;
  },
  
  // Get staff stats
  async getStaffStats(guildId, userId) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM staff_points WHERE guildId = ? AND userId = ?').get(guildId, userId);
    return row || null;
  },
  
  // Get user rank
  async getUserRank(guildId, userId) {
    const db = getDb();
    const row = db.prepare(
      `SELECT COUNT(*) as rank FROM staff_points WHERE guildId = ? AND points > (
        SELECT points FROM staff_points WHERE guildId = ? AND userId = ?
      )`
    ).get(guildId, guildId, userId);
    return (row?.rank || 0) + 1;
  },
  
  // Reset points (admin function)
  async resetPoints(guildId, userId = null) {
    const db = getDb();
    if (userId) {
      db.prepare('DELETE FROM staff_points WHERE guildId = ? AND userId = ?').run(guildId, userId);
    } else {
      db.prepare('DELETE FROM staff_points WHERE guildId = ?').run(guildId);
    }
  },
  
  // Get total staff count
  async getStaffCount(guildId) {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM staff_points WHERE guildId = ?').get(guildId);
    return row?.count || 0;
  }
};

export default StaffPoints;
