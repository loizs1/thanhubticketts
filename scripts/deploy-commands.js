import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

const commands = [];

async function loadCommands() {
  const commandsPath = join(__dirname, '../src/commands');
  const commandFolders = await readdir(commandsPath);
  
  for (const folder of commandFolders) {
    const commandFiles = await readdir(join(commandsPath, folder));
    
    for (const file of commandFiles) {
      if (!file.endsWith('.js')) continue;
      
      try {
        const command = await import(`../src/commands/${folder}/${file}`);
        if (command.default?.data) {
          commands.push(command.default.data.toJSON());
          console.log(chalk.gray(`  ✓ ${command.default.data.name}`));
        }
      } catch (error) {
        console.error(chalk.red(`  ✗ ${file}:`), error.message);
      }
    }
  }
}

async function deployCommands() {
  console.log(chalk.cyan('\n🚀 Deploying Commands...\n'));
  
  await loadCommands();
  
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  
  try {
    console.log(chalk.yellow(`\nDeploying ${commands.length} commands...`));
    
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    
    console.log(chalk.green(`\n✓ Successfully deployed ${data.length} commands!\n`));
  } catch (error) {
    console.error(chalk.red('\n✗ Deployment failed:'), error);
  }
}

deployCommands();
