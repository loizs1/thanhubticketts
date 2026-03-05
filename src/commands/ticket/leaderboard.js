import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import StaffPoints from '../../database/models/StaffPoints.js';
import colors from '../../config/colors.js';
import emojis from '../../config/emojis.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show staff leaderboard by points')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number (default: 1)')
        .setRequired(false)
        .setMinValue(1)),

  async execute(interaction, client) {
    // Defer reply immediately to avoid timeout
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (e) {
      // Interaction already expired, ignore
      return;
    }

    const guild = interaction.guild;
    const page = interaction.options.getInteger('page') || 1;
    const itemsPerPage = 10;

    try {
      // Get total count for pagination
      const totalStaff = await StaffPoints.getStaffCount(guild.id);
      const totalPages = Math.ceil(totalStaff / itemsPerPage);

      if (totalStaff === 0) {
        return interaction.editReply({
          content: `${emojis.info || 'ℹ️'} No staff points yet! Staff earn points by closing tickets.`
        });
      }

      // Adjust page if out of bounds
      let currentPage = page;
      if (currentPage < 1) currentPage = 1;
      if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

      const offset = (currentPage - 1) * itemsPerPage;
      const leaderboard = await StaffPoints.getLeaderboard(guild.id, itemsPerPage, offset);

      if (!leaderboard || leaderboard.length === 0) {
        return interaction.editReply({
          content: `${emojis.info || 'ℹ️'} No staff points yet! Staff earn points by closing tickets.`
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Staff Leaderboard`)
        .setDescription(`**Page ${currentPage} of ${totalPages}**\n\nTop performers in the ticket system:`)
        .setColor(colors.primary)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setTimestamp();

      let description = '';

      for (let i = 0; i < leaderboard.length; i++) {
        const staff = leaderboard[i];
        const rank = offset + i + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `\`#${rank}\``;

        description += `${medal} <@${staff.userId}> • **${staff.points}** pts\n`;
      }

      embed.addFields({ name: 'Rankings', value: description || 'No entries found.' });

      // Get user's own rank if they're in the leaderboard
      const userStats = await StaffPoints.getStaffStats(guild.id, interaction.user.id);
      if (userStats) {
        const userRank = await StaffPoints.getUserRank(guild.id, interaction.user.id);
        embed.setFooter({
          text: `Your Stats: #${userRank} (${userStats.points} pts) • Total Staff: ${totalStaff}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        });
      } else {
        embed.setFooter({
          text: `Total Staff: ${totalStaff} • Close tickets to join the leaderboard!`,
          iconURL: guild.iconURL({ dynamic: true })
        });
      }

      // Create pagination buttons with page numbers
      const components = [];

      // If there are more than 5 pages, show first, prev, current, next, last
      if (totalPages > 5) {
        const row = new ActionRowBuilder();

        // First page button
        if (currentPage > 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`leaderboard_page_1`)
              .setLabel('1')
              .setStyle(ButtonStyle.Secondary)
          );
        }

        // Previous button
        if (currentPage > 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`leaderboard_page_${currentPage - 1}`)
              .setLabel('⬅️')
              .setStyle(ButtonStyle.Secondary)
          );
        }

        // Current page (disabled - shows which page you're on)
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_page_${currentPage}`)
            .setLabel(`📄 ${currentPage}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        );

        // Next button
        if (currentPage < totalPages) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`leaderboard_page_${currentPage + 1}`)
              .setLabel('➡️')
              .setStyle(ButtonStyle.Secondary)
          );
        }

        // Last page button
        if (currentPage < totalPages) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`leaderboard_page_${totalPages}`)
              .setLabel(`${totalPages}`)
              .setStyle(ButtonStyle.Secondary)
          );
        }

        components.push(row);
      } else {
        // Show all page buttons (1, 2, 3, etc.)
        const row = new ActionRowBuilder();

        for (let p = 1; p <= totalPages; p++) {
          const isCurrentPage = p === currentPage;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`leaderboard_page_${p}`)
              .setLabel(isCurrentPage ? `📄 ${p}` : `${p}`)
              .setStyle(isCurrentPage ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(isCurrentPage)
          );
        }

        components.push(row);
      }

      await interaction.editReply({ embeds: [embed], components });

    } catch (error) {
      console.error('Error showing leaderboard:', error);
      try {
        await interaction.editReply({
          content: `${emojis.error || '❌'} An error occurred while loading the leaderboard: ${error.message}`
        });
      } catch (e) {
        // Ignore if edit also fails
      }
    }
  }
};

// Helper function to generate leaderboard embed (used by button handler)
export async function generateLeaderboardEmbed(guild, client, page, userId) {
  const itemsPerPage = 10;

  const totalStaff = await StaffPoints.getStaffCount(guild.id);
  const totalPages = Math.ceil(totalStaff / itemsPerPage);

  if (totalStaff === 0) {
    return { content: `${emojis.info || 'ℹ️'} No staff points yet! Staff earn points by closing tickets.` };
  }

  let currentPage = page;
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

  const offset = (currentPage - 1) * itemsPerPage;
  const leaderboard = await StaffPoints.getLeaderboard(guild.id, itemsPerPage, offset);

  if (!leaderboard || leaderboard.length === 0) {
    return { content: `${emojis.info || 'ℹ️'} No staff points yet! Staff earn points by closing tickets.` };
  }

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Staff Leaderboard`)
    .setDescription(`**Page ${currentPage} of ${totalPages}**\n\nTop performers in the ticket system:`)
    .setColor(colors.primary)
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .setTimestamp();

  let description = '';

  for (let i = 0; i < leaderboard.length; i++) {
    const staff = leaderboard[i];
    const rank = offset + i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `\`#${rank}\``;

    description += `${medal} <@${staff.userId}> • **${staff.points}** pts\n`;
  }

  embed.addFields({ name: 'Rankings', value: description || 'No entries found.' });

  // Get user's own rank if available
  if (userId) {
    const userStats = await StaffPoints.getStaffStats(guild.id, userId);
    if (userStats) {
      const userRank = await StaffPoints.getUserRank(guild.id, userId);
      const user = await client.users.fetch(userId).catch(() => null);
      embed.setFooter({
        text: `Your Stats: #${userRank} (${userStats.points} pts) • Total Staff: ${totalStaff}`,
        iconURL: user ? user.displayAvatarURL({ dynamic: true }) : guild.iconURL({ dynamic: true })
      });
    } else {
      embed.setFooter({ text: `Total Staff: ${totalStaff} • Close tickets to join the leaderboard!`, iconURL: guild.iconURL({ dynamic: true }) });
    }
  } else {
    embed.setFooter({ text: `Total Staff: ${totalStaff}`, iconURL: guild.iconURL({ dynamic: true }) });
  }

  // Create pagination buttons
  const components = [];

  if (totalPages > 5) {
    const row = new ActionRowBuilder();

    if (currentPage > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_page_1`)
          .setLabel('1')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    if (currentPage > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_page_${currentPage - 1}`)
          .setLabel('⬅️')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`leaderboard_page_${currentPage}`)
        .setLabel(`📄 ${currentPage}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    if (currentPage < totalPages) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_page_${currentPage + 1}`)
          .setLabel('➡️')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    if (currentPage < totalPages) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_page_${totalPages}`)
          .setLabel(`${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
      );
    }

    components.push(row);
  } else {
    const row = new ActionRowBuilder();

    for (let p = 1; p <= totalPages; p++) {
      const isCurrentPage = p === currentPage;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_page_${p}`)
          .setLabel(isCurrentPage ? `📄 ${p}` : `${p}`)
          .setStyle(isCurrentPage ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(isCurrentPage)
      );
    }

    components.push(row);
  }

  return { embeds: [embed], components };
}
