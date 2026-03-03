import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a professional HTML transcript
 * @param {Object} ticket - Ticket data
 * @param {Array} messages - Array of message objects
 * @param {Object} guild - Discord guild
 * @param {Object} channel - Discord channel
 * @returns {String} HTML content
 */
export function generateHTMLTranscript(ticket, messages, guild, channel) {
  const ticketNumber = ticket.ticketNumber || 'Unknown';
  const category = ticket.category || 'General';
  const username = ticket.username || 'Unknown';
  const subject = ticket.subject || 'No Subject';
  const openedAt = ticket.openedAt ? new Date(ticket.openedAt).toLocaleString() : 'Unknown';
  const closedAt = ticket.closedAt ? new Date(ticket.closedAt).toLocaleString() : 'Not closed';
  
  // Sort messages by timestamp
  const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  
  // Generate messages HTML
  let messagesHTML = '';
  for (const msg of sortedMessages) {
    const author = msg.author;
    const timestamp = new Date(msg.createdAt).toLocaleString();
    const content = escapeHtml(msg.content) || '<em>(No text content)</em>';
    const avatar = author.displayAvatarURL({ size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    
    // Handle attachments
    let attachmentsHTML = '';
    if (msg.attachments && msg.attachments.size > 0) {
      attachmentsHTML = '<div class="attachments">';
      for (const attachment of msg.attachments.values()) {
        if (attachment.contentType?.startsWith('image/')) {
          attachmentsHTML += `<img src="${attachment.url}" alt="Attachment" class="attachment-image">`;
        } else {
          attachmentsHTML += `<a href="${attachment.url}" target="_blank" class="attachment-file">📎 ${escapeHtml(attachment.name)}</a>`;
        }
      }
      attachmentsHTML += '</div>';
    }
    
    // Handle embeds
    let embedsHTML = '';
    if (msg.embeds && msg.embeds.length > 0) {
      embedsHTML = '<div class="embeds">';
      for (const embed of msg.embeds) {
        const embedColor = embed.hexColor || '#5865F2';
        embedsHTML += `
          <div class="embed" style="border-left-color: ${embedColor}">
            ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
            ${embed.description ? `<div class="embed-description">${escapeHtml(embed.description)}</div>` : ''}
            ${embed.fields?.map(f => `
              <div class="embed-field">
                <div class="embed-field-name">${escapeHtml(f.name)}</div>
                <div class="embed-field-value">${escapeHtml(f.value)}</div>
              </div>
            `).join('') || ''}
          </div>
        `;
      }
      embedsHTML += '</div>';
    }
    
    messagesHTML += `
      <div class="message">
        <div class="message-avatar">
          <img src="${avatar}" alt="${escapeHtml(author.username)}">
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-author" style="color: ${getUsernameColor(author)}">${escapeHtml(author.username)}</span>
            <span class="message-timestamp">${timestamp}</span>
          </div>
          <div class="message-body">${content}</div>
          ${attachmentsHTML}
          ${embedsHTML}
        </div>
      </div>
    `;
  }
  
  // Generate full HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${ticketNumber} Transcript</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #36393f;
      color: #dcddde;
      line-height: 1.6;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .header {
      background: #2f3136;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      border-left: 4px solid #5865f2;
    }
    
    .header h1 {
      color: #fff;
      font-size: 24px;
      margin-bottom: 10px;
    }
    
    .ticket-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin-top: 15px;
    }
    
    .info-item {
      background: #36393f;
      padding: 10px;
      border-radius: 4px;
    }
    
    .info-label {
      color: #72767d;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    
    .info-value {
      color: #fff;
      font-size: 14px;
    }
    
    .messages {
      background: #2f3136;
      border-radius: 8px;
      padding: 20px;
    }
    
    .message {
      display: flex;
      margin-bottom: 20px;
      padding: 10px;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    .message:hover {
      background: #32353b;
    }
    
    .message-avatar {
      margin-right: 15px;
      flex-shrink: 0;
    }
    
    .message-avatar img {
      width: 40px;
      height: 40px;
      border-radius: 50%;
    }
    
    .message-content {
      flex: 1;
      min-width: 0;
    }
    
    .message-header {
      margin-bottom: 4px;
    }
    
    .message-author {
      font-weight: 600;
      font-size: 15px;
      margin-right: 8px;
    }
    
    .message-timestamp {
      color: #72767d;
      font-size: 12px;
    }
    
    .message-body {
      color: #dcddde;
      font-size: 14px;
      word-wrap: break-word;
    }
    
    .attachments {
      margin-top: 8px;
    }
    
    .attachment-image {
      max-width: 300px;
      max-height: 200px;
      border-radius: 4px;
      margin-right: 8px;
    }
    
    .attachment-file {
      display: inline-block;
      background: #40444b;
      color: #00b0f4;
      padding: 8px 12px;
      border-radius: 4px;
      text-decoration: none;
      font-size: 13px;
      margin-right: 8px;
    }
    
    .attachment-file:hover {
      background: #4f545c;
    }
    
    .embeds {
      margin-top: 8px;
    }
    
    .embed {
      background: #2f3136;
      border-left: 4px solid;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 8px;
    }
    
    .embed-title {
      color: #fff;
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    .embed-description {
      color: #dcddde;
      font-size: 13px;
      margin-bottom: 8px;
    }
    
    .embed-field {
      margin-top: 8px;
    }
    
    .embed-field-name {
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 4px;
    }
    
    .embed-field-value {
      color: #dcddde;
      font-size: 13px;
    }
    
    .footer {
      text-align: center;
      padding: 20px;
      color: #72767d;
      font-size: 12px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎫 Ticket #${ticketNumber} Transcript</h1>
      <div class="ticket-info">
        <div class="info-item">
          <div class="info-label">Category</div>
          <div class="info-value">${escapeHtml(category)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Created By</div>
          <div class="info-value">${escapeHtml(username)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Subject</div>
          <div class="info-value">${escapeHtml(subject)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Opened At</div>
          <div class="info-value">${openedAt}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Closed At</div>
          <div class="info-value">${closedAt}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Server</div>
          <div class="info-value">${escapeHtml(guild.name)}</div>
        </div>
      </div>
    </div>
    
    <div class="messages">
      ${messagesHTML || '<p style="text-align: center; color: #72767d;">No messages found</p>'}
    </div>
    
    <div class="footer">
      Generated by Ticket Bot • ${new Date().toLocaleString()}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 * @param {String} text 
 * @returns {String}
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

/**
 * Get a color for username based on user properties
 * @param {Object} author 
 * @returns {String}
 */
function getUsernameColor(author) {
  if (author.bot) return '#5865f2'; // Bot color
  // Return random consistent color based on username
  const colors = ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63', '#f1c40f', '#e67e22', '#e74c3c'];
  const index = author.username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

export default {
  generateHTMLTranscript
};
