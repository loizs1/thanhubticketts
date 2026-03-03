# 🌐 Web Transcript Setup

## What Was Changed

1. **Added Express web server** (`src/systems/ticket/transcriptServer.js`)
   - Serves transcripts on a website
   - Main page lists all transcripts
   - Individual transcript pages with full message history

2. **Updated package.json**
   - Added `express` dependency

3. **Updated src/index.js**
   - Starts the web server when bot launches

4. **Updated src/commands/ticket/ticket.js**
   - When closing a ticket, generates transcript and saves to web
   - Adds "View Transcript" link in close message

## How It Works

When you close a ticket:
1. Bot fetches last 100 messages from the channel
2. Saves messages to `transcripts/{ticketId}.json`
3. Generates web URL: `http://localhost:3000/transcript/{ticketId}`
4. Posts link in Discord: "📄 **[View Transcript](url)**"

## Environment Variables (Optional)

Add these to your `.env` file:

```env
# Port for the web server (default: 3000)
TRANSCRIPT_PORT=3000

# Public URL for transcripts (for production)
TRANSCRIPT_HOST=https://yourdomain.com
```

## For PebbleHost Deployment

1. **Upload all files** including the new ones
2. **Install dependencies**: `npm install`
3. **Set environment variable** in PebbleHost panel:
   - Go to "Startup" tab
   - Add: `TRANSCRIPT_PORT` = `3000` (or any available port)
   - Add: `TRANSCRIPT_HOST` = your domain or PebbleHost URL

4. **Open port** in PebbleHost:
   - Go to "Network" tab
   - Allocate a port (e.g., 3000)
   - The web server will use this port

5. **Access transcripts**:
   - Local: `http://localhost:3000`
   - PebbleHost: `http://your-server-ip:3000` or your domain

## Features

✅ Beautiful HTML transcript pages  
✅ Lists all closed tickets on main page  
✅ Shows user avatars, timestamps, attachments  
✅ Mobile-friendly responsive design  
✅ No file downloads needed - view in browser  
✅ Links automatically posted when closing tickets

## Testing

Run the bot locally:
```bash
npm install
npm start
```

Then close a ticket and visit: `http://localhost:3000`
