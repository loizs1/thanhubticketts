import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getDb } from '../../database/database.js';
import Config from '../../database/models/Config.js';

import colors from '../../config/colors.js';
import emojis from '../../config/emojis.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear all ticket data from the database (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Only allow in guilds
    if (!interaction.guild) {
      return interaction.reply({
        content: `${emojis.error} This command can only be used in a server.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Check if user is administrator
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: `${emojis.error} You need Administrator permission to use this command.`,
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const db = getDb();

      // Get counts before deletion
      const ticketsCount = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
      const categoriesCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
      const configsCount = db.prepare('SELECT COUNT(*) as count FROM configs').get().count;
      const pointsCount = db.prepare('SELECT COUNT(*) as count FROM staff_points').get().count;

      // Optional: Delete existing Discord panel if found
      try {
        const config = await Config.findOne({ guildId: interaction.guild.id });
        if (config && config.panelMessageId && config.createTicketChannelId) {
          const channel = await interaction.guild.channels.fetch(config.createTicketChannelId).catch(() => null);
          if (channel) {
            const message = await channel.messages.fetch(config.panelMessageId).catch(() => null);
            if (message) await message.delete().catch(() => null);
          }
        }
      } catch (e) { /* ignore Discord errors */ }

      // Use exec for raw bulk deletions to ensure persistence via saveDatabase
      db.exec('DELETE FROM tickets');
      db.exec('DELETE FROM categories');
      db.exec('DELETE FROM configs');
      db.exec('DELETE FROM staff_points');

      // Clear in-memory caches
      try {
        const { clearAllCache } = await import('../../systems/ticket/ticketButtons.js');
        clearAllCache();
      } catch (e) {
        console.error('Failed to clear cache:', e);
      }

      // Create success embed
      const clearEmbed = new EmbedBuilder()
        .setTitle(`${emojis.success} Global Data Reset`)
        .setDescription('The entire ticket database has been successfully emptied.')
        .addFields(
          { name: '🎫 Tickets', value: ticketsCount.toString(), inline: true },
          { name: '📂 Categories', value: categoriesCount.toString(), inline: true },
          { name: '⚙️ Configs', value: configsCount.toString(), inline: true },
          { name: '🏆 Points', value: pointsCount.toString(), inline: true }
        )
        .setColor(colors.success)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setFooter({ text: 'All data has been cleared' })
        .setTimestamp();

      await interaction.editReply({
        embeds: [clearEmbed]
      });

    } catch (error) {
      console.error('Error clearing database:', error);

      await interaction.editReply({
        content: `${emojis.error} An error occurred while clearing the database: ${error.message}`
      });
    }
  }
};
