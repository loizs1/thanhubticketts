import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { config } from 'dotenv';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { connectDatabase } from './database/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
  ],
});

client.commands = new Collection();

async function loadCommands() {
  const commandFolders = await readdir(join(__dirname, 'commands'));
  
  for (const folder of commandFolders) {
    const commandFiles = await readdir(join(__dirname, 'commands', folder));
    
    for (const file of commandFiles) {
      if (!file.endsWith('.js')) continue;
      
      try {
        const command = await import(`./commands/${folder}/${file}`);
        
        if (command.default?.data && command.default?.execute) {
          client.commands.set(command.default.data.name, command.default);
          console.log(chalk.gray(`  ✓ ${command.default.data.name}`));
        }
      } catch (error) {
        console.error(chalk.red(`  ✗ ${file}:`), error.message);
      }
    }
  }
  
  console.log(chalk.green(`\n✓ ${client.commands.size} commands loaded`));
}

async function loadEvents() {
  const eventFiles = await readdir(join(__dirname, 'events'));
  
  for (const file of eventFiles) {
    if (!file.endsWith('.js')) continue;
    
    try {
      const event = await import(`./events/${file}`);
      
      if (event.default?.name && event.default?.execute) {
        if (event.default.once) {
          client.once(event.default.name, (...args) => event.default.execute(...args, client));
        } else {
          client.on(event.default.name, (...args) => event.default.execute(...args, client));
        }
        console.log(chalk.gray(`  ✓ ${event.default.name}`));
      }
    } catch (error) {
      console.error(chalk.red(`  ✗ ${file}:`), error.message);
    }
  }
  
  console.log(chalk.green('✓ Events loaded\n'));
}

async function init() {
  console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.cyan('  🎫 Ticket Bot v1.0'));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  try {
    console.log(chalk.yellow('Loading Database...'));
    await connectDatabase();
    
    console.log(chalk.yellow('Loading Commands...'));
    await loadCommands();
    
    console.log(chalk.yellow('Loading Events...'));
    await loadEvents();
    
    console.log(chalk.yellow('Logging in...\n'));
    await client.login(process.env.TOKEN);
    
  } catch (error) {
    console.error(chalk.red('\n✗ Bot initialization failed:'), error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled Rejection:'), error);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

init();
