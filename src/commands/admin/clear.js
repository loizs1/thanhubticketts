import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getDb } from '../../database/database.js';

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
      const ticketStmt = db.prepare('SELECT COUNT(*) as count FROM tickets');
      const categoryStmt = db.prepare('SELECT COUNT(*) as count FROM categories');
      const configStmt = db.prepare('SELECT COUNT(*) as count FROM configs');

      const tickets = ticketStmt.get().count;
      const categories = categoryStmt.get().count;
      const configs = configStmt.get().count;

      // Delete all tickets
      db.prepare('DELETE FROM tickets').run();
      
      // Delete all categories
      db.prepare('DELETE FROM categories').run();
      
      // Delete all configs
      db.prepare('DELETE FROM configs').run();


      // Create success embed
      const clearEmbed = new EmbedBuilder()
        .setTitle(`${emojis.success} Database Cleared`)
        .setDescription('All ticket data has been successfully cleared from the database.')
        .addFields(
          { name: 'Tickets Deleted', value: tickets.toString(), inline: true },
          { name: 'Categories Deleted', value: categories.toString(), inline: true },
          { name: 'Configs Deleted', value: configs.toString(), inline: true }
        )
        .setColor(colors.success)
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
