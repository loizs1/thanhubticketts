# 🎫 Discord Ticket Bot

Professional ticket system for Discord servers with categories, transcripts, and comprehensive management tools.

## ✨ Features

### Core Ticket System
- 🎟️ **Multi-Category Support** - Support, Sales, Bug Reports, etc.
- 📝 **Modal Input** - Collect detailed information on ticket creation
- 🔒 **Private Channels** - Automatic permission management
- 📊 **Ticket Panel** - Interactive dropdown menu for easy access

### Management Tools
- 👥 **Assign System** - Assign tickets to staff members
- ✅ **Claim Tickets** - Staff can claim unassigned tickets
- 📜 **Transcripts** - HTML transcripts with full message history
- 🔐 **Close/Delete** - Proper ticket lifecycle management
- 🔔 **Ticket Logs** - Complete audit trail

### Advanced Features
- ⏰ **Auto-Close** - Automatically close inactive tickets
- 📈 **Analytics** - Track ticket volume, response times, staff performance
- 🚫 **User Limits** - Prevent ticket spam (configurable)
- 🏷️ **Custom Categories** - Fully customizable ticket types
- 🎨 **Embed Styling** - Professional Discord-style embeds

## 📦 Installation

### Prerequisites
- Node.js 18.x or higher
- MongoDB database (local or Atlas)
- Discord Bot with required intents

### Setup

1. **Clone Repository**
```bash
git clone https://github.com/dq7x/ticket-bot.git
cd ticket-bot
```

2. **Install Dependencies**
```bash
npm install
```

3. **Configure Environment**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- `TOKEN` - Discord Bot Token
- `CLIENT_ID` - Application ID
- `GUILD_ID` - Your Server ID
- `MONGODB_URI` - MongoDB connection string

4. **Create Discord Bot**
- Go to [Discord Developer Portal](https://discord.com/developers/applications)
- Create New Application
- Bot → Add Bot
- Enable Intents:
  - ✅ Server Members Intent
  - ✅ Message Content Intent
- Copy Token to `.env`

5. **Invite Bot**

Required Permissions:
- Manage Channels
- Manage Roles
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Add Reactions

Invite URL:
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

6. **Deploy Commands**
```bash
npm run deploy
```

7. **Start Bot**
```bash
npm start
```

## 🚀 Usage

### Initial Setup

1. **Create Ticket Category**
```
/ticket-setup
```
This creates:
- 📁 Support category
- 🎟️ Create-ticket channel with panel
- 📝 Ticket-logs channel

2. **Configure Categories**
```
/category-add name:Support emoji:🆘 description:Get help from our team
/category-add name:Sales emoji:💰 description:Purchase inquiries
/category-add name:Bug emoji:🐛 description:Report bugs
```

3. **Set Staff Role**
```
/config set-role type:staff role:@Support Team
```

### User Commands

**Open Ticket**
- Click dropdown in create-ticket channel
- Select category
- Fill modal with details
- Ticket channel created automatically

**Close Ticket**
```
/close [reason]
```

### Staff Commands

**Assign Ticket**
```
/assign user:@StaffMember
```

**Claim Ticket**
```
/claim
```

**Add User**
```
/add user:@User
```

**Remove User**
```
/remove user:@User
```

**Close with Reason**
```
/close reason:Issue resolved
```

**Delete Ticket**
```
/delete [reason]
```

**Create Transcript**
```
/transcript
```

**View Statistics**
```
/ticket-stats [timeframe:7d]
```

## 📁 Project Structure

```
ticket-bot/
├── src/
│   ├── index.js                 # Bot entry point
│   ├── commands/
│   │   ├── ticket/
│   │   │   ├── ticket-setup.js
│   │   │   ├── close.js
│   │   │   ├── claim.js
│   │   │   ├── assign.js
│   │   │   ├── add.js
│   │   │   ├── remove.js
│   │   │   └── delete.js
│   │   ├── admin/
│   │   │   ├── category-add.js
│   │   │   ├── category-list.js
│   │   │   ├── category-remove.js
│   │   │   └── config.js
│   │   └── stats/
│   │       └── ticket-stats.js
│   ├── events/
│   │   ├── ready.js
│   │   ├── interactionCreate.js
│   │   └── messageCreate.js
│   ├── systems/
│   │   ├── ticket/
│   │   │   ├── ticketManager.js
│   │   │   ├── ticketPanel.js
│   │   │   ├── ticketTranscript.js
│   │   │   └── ticketButtons.js
│   │   ├── analytics/
│   │   │   └── statsManager.js
│   │   └── autoclose/
│   │       └── autocloseManager.js
│   ├── database/
│   │   ├── database.js
│   │   └── models/
│   │       ├── Ticket.js
│   │       ├── Category.js
│   │       ├── Config.js
│   │       └── Transcript.js
│   └── config/
│       ├── colors.js
│       └── emojis.js
├── scripts/
│   └── deploy-commands.js
├── transcripts/              # HTML transcripts
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 🎨 Customization

### Colors
Edit `src/config/colors.js`:
```javascript
export default {
  primary: '#5865F2',
  success: '#57F287',
  warning: '#FEE75C',
  error: '#ED4245',
};
```

### Ticket Limits
In `.env`:
```env
MAX_TICKETS_PER_USER=3
AUTO_CLOSE_DAYS=7
```

### Custom Categories
```
/category-add name:VIP emoji:👑 description:Premium support staff-only:true
```

## 📊 Analytics

View ticket statistics:
```
/ticket-stats timeframe:30d
```

Shows:
- Total tickets
- Open/Closed ratio
- Average response time
- Top staff members
- Busiest categories

## 🔧 Troubleshooting

**Bot not responding?**
- Check token in `.env`
- Verify intents are enabled
- Check bot permissions in server

**Commands not showing?**
- Run `npm run deploy` again
- Wait up to 1 hour for global commands
- Use guild commands (faster): Set GUILD_ID in .env

**Transcripts not saving?**
- Check `transcripts/` folder exists
- Verify write permissions
- Check MongoDB connection

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Credits

Created by [dq7x](https://github.com/dq7x)

## 📞 Support

- Create an issue on GitHub
- Join our [Discord Server](https://discord.gg/tCCsf6u3Bj)

---

**⭐ Star this repository if you find it useful!**
