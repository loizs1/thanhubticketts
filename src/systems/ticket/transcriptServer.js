import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../../database/database.js';
import { generateHTMLTranscript } from './transcriptGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.TRANSCRIPT_PORT || 3000;

// Helper to get HOST at runtime (not module load)
function getHost() {
  // Default to PebbleHost URL, fallback to localhost for development
  return process.env.TRANSCRIPT_HOST || 'http://thanhubtranscript.my.pebble.host:8143';
}





// Store transcripts in memory (or database)
const transcripts = new Map();

/**
 * Start the transcript web server
 */
export function startTranscriptServer() {
  app.use(express.static(path.join(__dirname, '../../../public')));
  
  // Main page - list all transcripts
  app.get('/', async (req, res) => {
    const db = getDb();
    let tickets = [];
    
    try {
      const stmt = db.prepare(`
        SELECT id, ticketNumber, guildId, username, category, status, openedAt, closedAt, transcriptUrl 
        FROM tickets 
        WHERE transcriptUrl IS NOT NULL 
        ORDER BY closedAt DESC
      `);
      tickets = stmt.all();
    } catch (e) {
      console.error('[TRANSCRIPT SERVER] Error fetching tickets:', e);
    }

    
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ticket Transcripts</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #36393f;
          color: #dcddde;
          padding: 20px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
        }
        h1 {
          color: #fff;
          margin-bottom: 20px;
          text-align: center;
        }
        .ticket-list {
          display: grid;
          gap: 10px;
        }
        .ticket-item {
          background: #2f3136;
          padding: 15px;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.2s;
        }
        .ticket-item:hover {
          background: #40444b;
        }
        .ticket-info h3 {
          color: #fff;
          margin-bottom: 5px;
        }
        .ticket-meta {
          color: #72767d;
          font-size: 13px;
        }
        .view-btn {
          background: #5865f2;
          color: #fff;
          padding: 8px 16px;
          border-radius: 4px;
          text-decoration: none;
          font-size: 14px;
        }
        .view-btn:hover {
          background: #4752c4;
        }
        .status {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          margin-left: 10px;
        }
        .status.open { background: #3ba55d; }
        .status.closed { background: #ed4245; }
        .empty {
          text-align: center;
          color: #72767d;
          padding: 40px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎫 Ticket Transcripts</h1>
        <div class="ticket-list">
    `;
    
    if (tickets.length === 0) {
      html += `<div class="empty">No transcripts available yet.</div>`;
    } else {
      for (const ticket of tickets) {
        const statusClass = ticket.status === 'open' ? 'open' : 'closed';
        html += `
          <div class="ticket-item">
            <div class="ticket-info">
              <h3>Ticket #${ticket.ticketNumber} <span class="status ${statusClass}">${ticket.status}</span></h3>
              <div class="ticket-meta">
                ${ticket.category} • ${ticket.username} • 
                ${ticket.closedAt ? new Date(ticket.closedAt).toLocaleString() : 'Not closed'}
              </div>
            </div>
            <a href="/transcript/${ticket.id}" class="view-btn">View Transcript</a>
          </div>
        `;
      }
    }
    
    html += `
        </div>
      </div>
    </body>
    </html>
    `;
    
    res.send(html);
  });
  
  // Download transcript as HTML file (forces download)
  app.get('/download/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    const db = getDb();
    
    // Get ticket data
    let ticket = null;
    try {
      const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
      ticket = stmt.get(ticketId);
    } catch (e) {
      console.error('[TRANSCRIPT SERVER] Error fetching ticket:', e);
    }
    
    if (!ticket) {
      return res.status(404).send('Transcript not found');
    }
    
    // Get messages from file
    let messages = [];
    if (ticket.transcriptPath) {
      try {
        const fs = await import('fs');
        const data = fs.readFileSync(ticket.transcriptPath, 'utf8');
        messages = JSON.parse(data);
      } catch (e) {
        console.error('Error loading transcript messages:', e);
      }
    }
    
    // Convert plain message objects
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      createdAt: new Date(msg.createdAt),
      createdTimestamp: msg.createdTimestamp,
      author: {
        username: msg.author.username,
        bot: msg.author.bot,
        displayAvatarURL: () => msg.author.displayAvatarURL
      },
      attachments: {
        size: msg.attachments?.length || 0,
        values: () => msg.attachments?.map(att => ({
          url: att.url,
          name: att.name,
          contentType: att.contentType
        })) || []
      },
      embeds: msg.embeds?.map(embed => ({
        title: embed.title,
        description: embed.description,
        hexColor: embed.hexColor,
        fields: embed.fields
      })) || []
    }));
    
    // Generate HTML
    const html = generateHTMLTranscript(
      ticket,
      formattedMessages,
      { name: ticket.guildName || 'Discord Server' },
      { name: `ticket-${ticket.ticketNumber}` }
    );
    
    // Force download with Content-Disposition header
    const filename = `ticket-${ticket.ticketNumber}-${(ticket.category || 'transcript').toLowerCase().replace(/\s+/g, '-')}.html`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // View specific transcript
  app.get('/transcript/:ticketId', async (req, res) => {

    const { ticketId } = req.params;
    const db = getDb();
    
    // Get ticket data
    let ticket = null;
    try {
      const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
      ticket = stmt.get(ticketId);
    } catch (e) {
      console.error('[TRANSCRIPT SERVER] Error fetching ticket:', e);
    }
    
    if (!ticket) {
      return res.status(404).send('Transcript not found');
    }

    
    // Get messages from JSON file
    let messages = [];
    if (ticket.transcriptPath) {
      try {
        const fs = await import('fs');
        const data = fs.readFileSync(ticket.transcriptPath, 'utf8');
        messages = JSON.parse(data);
      } catch (e) {
        console.error('Error loading transcript messages:', e);
      }
    }
    
    // Convert plain message objects to match what generateHTMLTranscript expects
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      createdAt: new Date(msg.createdAt),
      createdTimestamp: msg.createdTimestamp,
      author: {
        username: msg.author.username,
        bot: msg.author.bot,
        displayAvatarURL: () => msg.author.displayAvatarURL
      },
      attachments: {
        size: msg.attachments?.length || 0,
        values: () => msg.attachments?.map(att => ({
          url: att.url,
          name: att.name,
          contentType: att.contentType
        })) || []
      },
      embeds: msg.embeds?.map(embed => ({
        title: embed.title,
        description: embed.description,
        hexColor: embed.hexColor,
        fields: embed.fields
      })) || []
    }));
    
    // Generate HTML
    const html = generateHTMLTranscript(
      ticket,
      formattedMessages,
      { name: ticket.guildName || 'Discord Server' },
      { name: `ticket-${ticket.ticketNumber}` }
    );
    
    res.send(html);
  });

  
  // API endpoint to save transcript
  app.post('/api/save-transcript', express.json(), async (req, res) => {
    const { ticketId } = req.body;
    
    // Save to database
    const db = getDb();
    const transcriptUrl = `${getHost()}/transcript/${ticketId}`;
    
    try {
      const stmt = db.prepare('UPDATE tickets SET transcriptUrl = ? WHERE id = ?');
      stmt.run(transcriptUrl, ticketId);
      res.json({ success: true, url: transcriptUrl });
    } catch (e) {
      console.error('[TRANSCRIPT SERVER] Error saving transcript URL:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  
  // Listen on 0.0.0.0 for PebbleHost (external access)
  const HOST = '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`🌐 Transcript server running on http://${HOST}:${PORT}`);
    console.log(`🌐 External URL: ${getHost()}`);
  });

  
  return app;
}

/**
 * Get the transcript URL for a ticket
 */
export function getTranscriptUrl(ticketId) {
  return `${getHost()}/transcript/${ticketId}`;
}

export function getDownloadUrl(ticketId) {
  return `${getHost()}/download/${ticketId}`;
}




export default {
  startTranscriptServer,
  getTranscriptUrl
};
