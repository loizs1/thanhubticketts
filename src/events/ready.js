import chalk from 'chalk';
import Config from '../database/models/Config.js';
import Ticket from '../database/models/Ticket.js';
import Category from '../database/models/Category.js';
import { refreshTicketPanel } from '../systems/ticket/ticketPanel.js';

export default {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(chalk.green(`✓ Logged in as ${client.user.tag}`));
    console.log(chalk.cyan(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`));

    // Get total servers
    const serverCount = client.guilds.cache.size;
    console.log(chalk.white(`📊 Servers: ${serverCount}`));
    console.log(chalk.white(`👥 Users: ${client.users.cache.size}`));
    console.log(chalk.white(`📝 Commands: ${client.commands.size}\n`));

    // Panel restoration
    console.log(chalk.yellow('Loading Panels...'));
    try {
      const configs = await Config.find({});
      console.log(chalk.gray(`  Found ${configs.length} configurations in database.`));
      let panelsRestored = 0;

      for (const config of configs) {
        if (config.panelMessageId && config.createTicketChannelId) {
          const guild = client.guilds.cache.get(config.guildId);
          if (guild) {
            console.log(chalk.gray(`  Restoring panel for guild: ${guild.name} (${config.guildId})`));
            await refreshTicketPanel(guild, config).catch(err => {
              console.error(chalk.red(`  ✗ Failed to refresh panel for ${guild.name}:`), err.message);
            });
            panelsRestored++;
          } else {
            console.warn(chalk.yellow(`  ⚠️ Skipping restoration: Guild ${config.guildId} not found in client cache.`));
          }
        } else {
          console.warn(chalk.yellow(`  ⚠️ Skipping restoration for guild ${config.guildId}: Missing panelMessageId or channelId.`));
        }
      }
      console.log(chalk.green(`✓ Panel restoration complete (${panelsRestored} panels)`));
    } catch (error) {
      console.error(chalk.red('✗ Panel restoration failed:'), error.message);
    }

    // Ticket restoration
    console.log(chalk.yellow('Loading Tickets...'));
    try {
      // Get open tickets from database
      const openTickets = await Ticket.find({ status: { $in: ['open', 'in_progress', 'waiting'] } });
      let validTickets = 0;
      let serverTickets = {};

      for (const ticket of openTickets) {
        const guild = client.guilds.cache.get(ticket.guildId);
        if (guild) {
          // Verify the ticket channel still exists
          const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
          if (channel) {
            validTickets++;
            // Count by server
            if (!serverTickets[ticket.guildId]) {
              serverTickets[ticket.guildId] = 0;
            }
            serverTickets[ticket.guildId]++;
          }
        }
      }

      // Get total ticket count from database
      const totalTickets = await Ticket.countDocuments();

      console.log(chalk.green(`✓ Ticket restoration complete`));
      console.log(chalk.white(`  - Active Tickets: ${validTickets}`));
      console.log(chalk.white(`  - Total Tickets: ${totalTickets}`));

      // Log servers with active tickets
      if (Object.keys(serverTickets).length > 0) {
        console.log(chalk.cyan(`\n  Servers with active tickets:`));
        for (const [guildId, count] of Object.entries(serverTickets)) {
          const guild = client.guilds.cache.get(guildId);
          const guildName = guild ? guild.name : guildId;
          console.log(chalk.white(`    - ${guildName}: ${count} tickets`));
        }
      }
      console.log();
    } catch (error) {
      console.error(chalk.red('✗ Ticket restoration failed:'), error.message);
    }

    // Set bot activity with server count
    client.user.setActivity(`🎫 ${serverCount} Servers`, { type: 'WATCHING' });

    console.log(chalk.cyan(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`));
  }
};
