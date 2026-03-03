# MySQL Setup Guide

## Environment Variables

Add these to your `.env` file:

```
env
# MySQL Database Configuration
DB_HOST=your_mysql_host
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=ticketbot

# Discord Bot Token
TOKEN=your_discord_bot_token

# Your Discord Server ID
GUILD_ID=your_server_id
```

## For PebbleHost Users

If you're using PebbleHost, you can find your MySQL credentials in the database section:

```
DB_HOST=localhost (or your MySQL host from PebbleHost)
DB_USER=your PebbleHost database username
DB_PASSWORD=your PebbleHost database password
DB_NAME=your PebbleHost database name
```

## Database Tables

The bot will automatically create these tables:
- `categories` - Ticket categories
- `configs` - Server configuration
- `tickets` - Support tickets

## Commands

Run the bot:
```
bash
npm start
```

## Migrating from MongoDB

If you were using MongoDB before:
1. Update your `.env` file with MySQL credentials
2. Remove `MONGODB_URI` from your `.env`
3. Add the `DB_*` variables shown above
4. Restart the bot - it will create tables automatically

## Notes

- The bot automatically creates the database if it doesn't exist
- Existing data is preserved (no migration needed)
- All data is stored in MySQL format
