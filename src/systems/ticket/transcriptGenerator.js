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
  console.log(`[TRANSCRIPT GEN] Received ${messages?.length || 0} messages`);
  console.log(`[TRANSCRIPT GEN] First message:`, messages?.[0] ? {
    author: messages[0].author?.username,
    content: messages[0].content?.substring(0, 50),
    createdAt: messages[0].createdAt
  } : 'No messages');
  
  const ticketNumber = ticket.ticketNumber || 'Unknown';

  const category = ticket.category || 'General';
  const username = ticket.username || 'Unknown';
  const subject = ticket.subject || 'No Subject';
  const openedAt = ticket.openedAt ? new Date(ticket.openedAt).toLocaleString() : 'Unknown';
  const closedAt = ticket.closedAt ? new Date(ticket.closedAt).toLocaleString() : 'Not closed';
  const closedBy = ticket.closedBy || 'N/A';
  
  // Sort messages by timestamp
  const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  console.log(`[TRANSCRIPT GEN] Sorted ${sortedMessages.length} messages`);
  
  // Generate messages HTML

  let messagesHTML = '';
  let lastAuthor = null;
  let lastTimestamp = 0;
  
  for (const msg of sortedMessages) {
    const author = msg.author;
    const timestamp = new Date(msg.createdAt);
    const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = timestamp.toLocaleDateString();
    const fullTimestamp = timestamp.toLocaleString();
    
    const content = formatMessageContent(msg.content) || '';
    const avatar = author.displayAvatarURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    
    // Check if we should show avatar (new author or 5+ minutes since last message)
    const showAvatar = lastAuthor !== author.id || (timestamp - lastTimestamp) > 5 * 60 * 1000;
    lastAuthor = author.id;
    lastTimestamp = timestamp;
    
    // Handle attachments
    let attachmentsHTML = '';
    if (msg.attachments && msg.attachments.size > 0) {
      attachmentsHTML = '<div class="attachments">';
      for (const attachment of msg.attachments.values()) {
        if (attachment.contentType?.startsWith('image/')) {
          attachmentsHTML += `
            <div class="attachment image">
              <img src="${attachment.url}" alt="${escapeHtml(attachment.name)}" loading="lazy">
              <div class="attachment-name">${escapeHtml(attachment.name)}</div>
            </div>`;
        } else if (attachment.contentType?.startsWith('video/')) {
          attachmentsHTML += `
            <div class="attachment video">
              <video controls src="${attachment.url}"></video>
              <div class="attachment-name">${escapeHtml(attachment.name)}</div>
            </div>`;
        } else {
          attachmentsHTML += `
            <a href="${attachment.url}" target="_blank" class="attachment file">
              <div class="file-icon">📎</div>
              <div class="file-info">
                <div class="file-name">${escapeHtml(attachment.name)}</div>
                <div class="file-size">${formatFileSize(attachment.size)}</div>
              </div>
            </a>`;
        }
      }
      attachmentsHTML += '</div>';
    }
    
    // Handle embeds
    let embedsHTML = '';
    if (msg.embeds && msg.embeds.length > 0) {
      for (const embed of msg.embeds) {
        const embedColor = embed.hexColor || '#5865F2';
        embedsHTML += `
          <div class="embed" style="border-left-color: ${embedColor}">
            ${embed.author?.name ? `<div class="embed-author">
              ${embed.author.iconURL ? `<img src="${embed.author.iconURL}" class="embed-author-icon">` : ''}
              <span>${escapeHtml(embed.author.name)}</span>
            </div>` : ''}
            ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
            ${embed.description ? `<div class="embed-description">${formatEmbedDescription(embed.description)}</div>` : ''}
            ${embed.image?.url ? `<img src="${embed.image.url}" class="embed-image" loading="lazy">` : ''}
            ${embed.thumbnail?.url ? `<img src="${embed.thumbnail.url}" class="embed-thumbnail" loading="lazy">` : ''}
            ${embed.fields?.length ? `<div class="embed-fields">
              ${embed.fields.map(f => `
                <div class="embed-field ${f.inline ? 'inline' : ''}">
                  <div class="embed-field-name">${escapeHtml(f.name)}</div>
                  <div class="embed-field-value">${formatEmbedDescription(f.value)}</div>
                </div>
              `).join('')}
            </div>` : ''}
            ${embed.footer?.text ? `<div class="embed-footer">
              ${embed.footer.iconURL ? `<img src="${embed.footer.iconURL}" class="embed-footer-icon">` : ''}
              <span>${escapeHtml(embed.footer.text)}</span>
            </div>` : ''}
          </div>
        `;
      }
    }
    
    // User badges
    let badges = '';
    if (author.bot) badges += '<span class="badge bot">BOT</span>';
    if (author.system) badges += '<span class="badge system">SYSTEM</span>';
    
    // Build message
    if (showAvatar) {
      messagesHTML += `
        <div class="message-group">
          <div class="message-avatar">
            <img src="${avatar}" alt="${escapeHtml(author.username)}" loading="lazy">
          </div>
          <div class="message-content">
            <div class="message-header">
              <span class="message-author" style="color: ${getUsernameColor(author)}">${escapeHtml(author.username)}</span>
              ${badges}
              <span class="message-timestamp" title="${fullTimestamp}">${dateString} ${timeString}</span>
            </div>
            <div class="message-body">${content}</div>
            ${attachmentsHTML}
            ${embedsHTML}
          </div>
        </div>
      `;
    } else {
      // Compact message (same author)
      messagesHTML += `
        <div class="message-compact">
          <span class="compact-time" title="${fullTimestamp}">${timeString}</span>
          <div class="message-body">${content}</div>
          ${attachmentsHTML}
          ${embedsHTML}
        </div>
      `;
    }
  }
  
  console.log(`[TRANSCRIPT GEN] Generated HTML with ${sortedMessages.length} messages`);
  
  // Generate full HTML
  return `<!DOCTYPE html>

<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${ticketNumber} Transcript - ${escapeHtml(guild.name)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    :root {
      --bg-primary: #1a1b1e;
      --bg-secondary: #2b2d31;
      --bg-tertiary: #313338;
      --bg-hover: #3a3c42;
      --text-primary: #f2f3f5;
      --text-secondary: #b5bac1;
      --text-muted: #6d6f78;
      --accent: #5865f2;
      --accent-hover: #4752c4;
      --border: #3f4147;
      --success: #3ba55d;
      --warning: #f9a63c;
      --danger: #ed4245;
    }
    
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* Header */
    .header {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      border: 1px solid var(--border);
      position: relative;
      overflow: hidden;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--accent), var(--success));
    }
    
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .header h1::before {
      content: '🎫';
      font-size: 32px;
    }
    
    .ticket-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    
    .info-item {
      background: var(--bg-tertiary);
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    
    .info-label {
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .info-value {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 500;
    }
    
    /* Messages Container */
    .messages-container {
      background: var(--bg-secondary);
      border-radius: 12px;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    
    .messages-header {
      padding: 16px 20px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .messages {
      padding: 16px;
    }
    
    /* Message Group */
    .message-group {
      display: flex;
      gap: 16px;
      margin-bottom: 4px;
      padding: 4px 0;
    }
    
    .message-avatar {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
    }
    
    .message-avatar img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    
    .message-content {
      flex: 1;
      min-width: 0;
    }
    
    .message-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      height: 22px;
    }
    
    .message-author {
      font-weight: 600;
      font-size: 15px;
    }
    
    .badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    
    .badge.bot {
      background: var(--accent);
      color: white;
    }
    
    .badge.system {
      background: var(--danger);
      color: white;
    }
    
    .message-timestamp {
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 400;
      cursor: default;
    }
    
    .message-body {
      color: var(--text-primary);
      font-size: 15px;
      line-height: 1.5;
      word-wrap: break-word;
    }
    
    .message-body a {
      color: #00b0f4;
      text-decoration: none;
    }
    
    .message-body a:hover {
      text-decoration: underline;
    }
    
    /* Compact Message */
    .message-compact {
      display: flex;
      gap: 16px;
      padding: 2px 0 2px 56px;
      margin-bottom: 4px;
    }
    
    .compact-time {
      color: var(--text-muted);
      font-size: 11px;
      width: 56px;
      flex-shrink: 0;
      text-align: right;
      padding-top: 3px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .message-compact:hover .compact-time {
      opacity: 1;
    }
    
    /* Attachments */
    .attachments {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .attachment {
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      max-width: 100%;
    }
    
    .attachment.image {
      max-width: 400px;
    }
    
    .attachment.image img {
      width: 100%;
      max-height: 300px;
      object-fit: cover;
      display: block;
    }
    
    .attachment.video {
      max-width: 400px;
    }
    
    .attachment.video video {
      width: 100%;
      max-height: 300px;
      display: block;
    }
    
    .attachment-name {
      padding: 8px 12px;
      font-size: 13px;
      color: var(--text-secondary);
      background: var(--bg-secondary);
    }
    
    .attachment.file {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      text-decoration: none;
      color: var(--text-primary);
      transition: background 0.2s;
      max-width: 400px;
    }
    
    .attachment.file:hover {
      background: var(--bg-hover);
    }
    
    .file-icon {
      font-size: 24px;
    }
    
    .file-info {
      flex: 1;
      min-width: 0;
    }
    
    .file-name {
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .file-size {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    
    /* Embeds */
    .embed {
      background: var(--bg-tertiary);
      border-left: 4px solid;
      border-radius: 4px;
      padding: 12px 16px;
      margin-top: 8px;
      max-width: 520px;
    }
    
    .embed-author {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--text-primary);
    }
    
    .embed-author-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
    }
    
    .embed-title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    
    .embed-description {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.5;
      margin-bottom: 12px;
    }
    
    .embed-image {
      max-width: 100%;
      max-height: 300px;
      border-radius: 4px;
      margin-top: 8px;
    }
    
    .embed-thumbnail {
      float: right;
      max-width: 80px;
      max-height: 80px;
      border-radius: 4px;
      margin-left: 12px;
    }
    
    .embed-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    
    .embed-field.inline {
      grid-column: span 1;
    }
    
    .embed-field:not(.inline) {
      grid-column: 1 / -1;
    }
    
    .embed-field-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    
    .embed-field-value {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.4;
    }
    
    .embed-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
    }
    
    .embed-footer-icon {
      width: 16px;
      height: 16px;
      border-radius: 50%;
    }
    
    /* Footer */
    .footer {
      text-align: center;
      padding: 24px;
      color: var(--text-muted);
      font-size: 12px;
      margin-top: 24px;
    }
    
    .footer a {
      color: var(--accent);
      text-decoration: none;
    }
    
    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 48px 20px;
      color: var(--text-muted);
    }
    
    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    
    /* Responsive */
    @media (max-width: 600px) {
      .container {
        padding: 10px;
      }
      
      .header {
        padding: 16px;
      }
      
      .header h1 {
        font-size: 22px;
      }
      
      .ticket-info {
        grid-template-columns: 1fr;
      }
      
      .message-compact {
        padding-left: 0;
      }
      
      .compact-time {
        display: none;
      }
    }
    
    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .message-group {
      animation: fadeIn 0.3s ease;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Ticket #${ticketNumber} Transcript</h1>
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
          <div class="info-label">Opened</div>
          <div class="info-value">${openedAt}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Closed</div>
          <div class="info-value">${closedAt}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Closed By</div>
          <div class="info-value">${escapeHtml(closedBy)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Server</div>
          <div class="info-value">${escapeHtml(guild.name)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Messages</div>
          <div class="info-value">${sortedMessages.length}</div>
        </div>
      </div>
    </div>
    
    <div class="messages-container">
      <div class="messages-header">
        💬 ${sortedMessages.length} message${sortedMessages.length !== 1 ? 's' : ''}
      </div>
      <div class="messages">
        ${messagesHTML || `
          <div class="empty-state">
            <div class="empty-state-icon">📝</div>
            <div>No messages in this ticket</div>
          </div>
        `}
      </div>
    </div>
    
    <div class="footer">
      <div>Generated by Ticket Bot • ${new Date().toLocaleString()}</div>
      <div style="margin-top: 8px;">
        <a href="https://github.com/loizs1/thanhubticketts" target="_blank">View on GitHub</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Format message content with markdown-like styling
 */
function formatMessageContent(content) {
  if (!content) return '';
  
  // Escape HTML first
  let formatted = escapeHtml(content);
  
  // Convert URLs to links
  formatted = formatted.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank">$1</a>'
  );
  
  // Bold
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Code blocks
  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Inline code
  formatted = formatted.replace(/`(.+?)`/g, '<code>$1</code>');
  
  // Newlines to <br>
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
}

/**
 * Format embed description
 */
function formatEmbedDescription(text) {
  if (!text) return '';
  return formatMessageContent(text);
}

/**
 * Escape HTML special characters
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
 * Format file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get a color for username
 */
function getUsernameColor(author) {
  if (author.bot) return '#5865f2';
  
  // Generate consistent color from username
  const colors = [
    '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63',
    '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#34495e'
  ];
  
  let hash = 0;
  for (let i = 0; i < author.username.length; i++) {
    hash = author.username.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

export default {
  generateHTMLTranscript
};
