import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import Ticket from '../../database/models/Ticket.js';
import Config from '../../database/models/Config.js';
import Category from '../../database/models/Category.js';
import StaffPoints from '../../database/models/StaffPoints.js';
import colors from '../../config/colors.js';
import emojis from '../../config/emojis.js';
import { generateHTMLTranscript } from '../../systems/ticket/transcriptGenerator.js';
import { getTranscriptUrl } from '../../systems/ticket/transcriptServer.js';
import { refreshTicketPanel } from '../../systems/ticket/ticketPanel.js';


// Simple in-memory cache for tickets and configs
const ticketCache = new Map();
const configCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCachedTicket(channelId) {
  const cached = ticketCache.get(channelId);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedTicket(channelId, ticket) {
  ticketCache.set(channelId, { data: ticket, time: Date.now() });
}

function getCachedConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedConfig(guildId, config) {
  configCache.set(guildId, { data: config, time: Date.now() });
}

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management commands (Staff Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a ticket (and close it first)')
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for deleting the ticket')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close a ticket')
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for closing the ticket')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reopen')
        .setDescription('Reopen a closed ticket'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Claim a ticket as staff'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a user to the ticket')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to add to the ticket')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user from the ticket')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to remove from the ticket')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('assign')
        .setDescription('Assign a ticket to a staff member')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to assign the ticket to')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.channel;
    const guildId = interaction.guild.id;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Check cache first for ticket
      let ticket = getCachedTicket(channel.id);

      if (!ticket) {
        ticket = await Ticket.findByChannelId(channel.id);
        if (ticket) setCachedTicket(channel.id, ticket);
      }

      if (!ticket) {
        return interaction.editReply({
          content: `${emojis.error} This channel is not a ticket channel.`
        });
      }

      // Check if user is staff - optimized
      const member = interaction.member;
      let isStaff = false;

      // Quick admin check first
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        isStaff = true;
      } else {
        // Check cache for config
        let config = getCachedConfig(guildId);
        if (!config) {
          config = await Config.findOne({ guildId });
          if (config) setCachedConfig(guildId, config);
        }

        // Check global admin role (from /setup config staff)
        if (config?.staffRoleId && member.roles.cache.has(config.staffRoleId)) {
          isStaff = true;
        }

        // Check category-specific staff roles
        if (!isStaff && ticket?.category) {
          const category = await Category.findOne({
            guildId: guildId,
            name: ticket.category
          }).first();

          if (category?.staffRoleIds?.length > 0) {
            const hasStaffRole = category.staffRoleIds.some(roleId =>
              member.roles.cache.has(roleId)
            );
            if (hasStaffRole) {
              isStaff = true;
            }
          }
        }
      }

      if (!isStaff) {
        return interaction.editReply({
          content: `${emojis.error} Only staff members can use ticket commands. You need either the global admin role or a category-specific staff role.`
        });
      }


      switch (subcommand) {
        case 'delete':
          await handleDelete(interaction, ticket, channel, guildId);
          break;
        case 'close':
          await handleClose(interaction, ticket, channel, guildId);
          break;
        case 'reopen':
          await handleReopen(interaction, ticket, channel, guildId);
          break;
        case 'claim':
          await handleClaim(interaction, ticket, channel, guildId);
          break;
        case 'add':
          await handleAdd(interaction, ticket, channel);
          break;
        case 'remove':
          await handleRemove(interaction, ticket, channel);
          break;
        case 'assign':
          await handleAssign(interaction, ticket, channel);
          break;
        default:
          await interaction.editReply({
            content: `${emojis.error} Unknown subcommand.`
          });
      }

    } catch (error) {
      console.error(`Error executing ticket ${subcommand}:`, error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: `${emojis.error} An error occurred while processing the command.`
          });
        }
      } catch (replyError) {
        console.error('Failed to send error reply:', replyError);
      }
    }
  }
};

// Helper function to get base channel name (without prefixes)
function getBaseChannelName(ticket) {
  let categoryName = ticket.category;

  if (!categoryName && ticket.channelName) {
    const parts = ticket.channelName.split('-');
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      if (!isNaN(lastPart)) {
        categoryName = parts.slice(0, -1).join('-').replace(/^(closed-|reopen-)/, '');
      } else {
        categoryName = parts.join('-').replace(/^(closed-|reopen-)/, '');
      }
    }
  }

  if (!categoryName) {
    categoryName = 'ticket';
  }

  const cleanCategory = categoryName.toLowerCase().replace(/\s+/g, '-');
  return `${cleanCategory}-${String(ticket.ticketNumber).padStart(2, '0')}`;
}

// Helper to check if user can close a claimed ticket
// STRICT: Only the claimer can close their claimed ticket
async function canCloseTicket(interaction, ticket) {
  // If not claimed, anyone with staff perms can close
  if (!ticket.claimedBy) {
    return { allowed: true };
  }

  // If claimed by the user themselves, they can close
  if (ticket.claimedBy === interaction.user.id) {
    return { allowed: true };
  }

  // Otherwise, only the claimer can close - admin and staff cannot override
  const claimedByUser = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
  const claimedByName = claimedByUser ? claimedByUser.user.tag : 'Another staff member';

  return {
    allowed: false,
    message: `${emojis.error} This ticket is claimed by **${claimedByName}**. Only they can close it.`
  };
}

// Helper to check if user can reopen a claimed ticket
// STRICT: Only the claimer can reopen their claimed ticket
async function canReopenTicket(interaction, ticket) {
  // If not claimed, anyone with staff perms can reopen
  if (!ticket.claimedBy) {
    return { allowed: true };
  }

  // If claimed by the user themselves, they can reopen
  if (ticket.claimedBy === interaction.user.id) {
    return { allowed: true };
  }

  // Otherwise, only the claimer can reopen - admin and staff cannot override
  const claimedByUser = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
  const claimedByName = claimedByUser ? claimedByUser.user.tag : 'Another staff member';

  return {
    allowed: false,
    message: `${emojis.error} This ticket is claimed by **${claimedByName}**. Only they can reopen it.`
  };
}


async function handleDelete(interaction, ticket, channel, guildId) {
  const initialStatus = ticket.status;
  const reason = interaction.options.getString('reason') || 'No reason provided';

  // Check if ticket is claimed by someone else
  const closeCheck = await canCloseTicket(interaction, ticket);
  if (!closeCheck.allowed) {
    return interaction.editReply({ content: closeCheck.message });
  }

  // Use ISO string for dates
  await Ticket.updateOne(
    { channelId: channel.id },
    {
      $set: {
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: interaction.user.id,
        closeReason: `DELETED: ${reason}`
      }
    }
  );

  let config = getCachedConfig(guildId);
  if (!config) {
    config = await Config.findOne({ guildId });
    if (config) setCachedConfig(guildId, config);
  }

  if (config?.ticketLogChannelId) {
    const logChannel = await interaction.guild.channels.fetch(config.ticketLogChannelId).catch(() => null);

    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle(`${emojis.danger} Ticket Deleted`)
        .addFields(
          { name: 'Ticket #', value: ticket.ticketNumber?.toString() || 'Unknown', inline: true },
          { name: 'User', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Deleted By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Category', value: ticket.category || 'Unknown', inline: true },
          { name: 'Subject', value: ticket.subject || 'No subject', inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setColor(colors.error)
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] });
    }
  }

  // Award points for deleting ticket (if it was still open)
  const pointsEnabled = config?.pointsEnabled !== false;
  const pointsToAward = config?.pointsOnClose || 1;

  if (pointsEnabled && pointsToAward > 0 && initialStatus !== 'closed') {
    try {
      await StaffPoints.addPoints(guildId, interaction.user.id, interaction.user.tag, pointsToAward, 'close');
      console.log(`[POINTS] Awarded ${pointsToAward} points to ${interaction.user.tag} for deleting ticket #${ticket.ticketNumber}`);
    } catch (e) {
      console.error('[POINTS] Error adding delete points:', e);
    }
  }

  setTimeout(async () => {
    try {
      await channel.delete();
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  }, 1000);

  // Refresh ticket panel so users can create new tickets
  try {
    await refreshTicketPanel(interaction.guild, config);
  } catch (err) {
    console.log('[PANEL] Could not refresh panel:', err.message);
  }

  await interaction.editReply({
    content: `${emojis.success} Ticket deleted successfully!`
  });
}

async function handleClose(interaction, ticket, channel, guildId) {
  const reason = interaction.options.getString('reason') || 'No reason provided';

  // Check if ticket is already closed
  if (ticket.status === 'closed') {
    return interaction.editReply({
      content: `${emojis.error} This ticket is already closed.`
    });
  }

  // Check if ticket is claimed by someone else
  const closeCheck = await canCloseTicket(interaction, ticket);
  if (!closeCheck.allowed) {
    return interaction.editReply({ content: closeCheck.message });
  }

  // Generate transcript
  let transcriptUrl = null;
  try {
    // Fetch messages from the channel
    const messages = await channel.messages.fetch({ limit: 100 });
    const messageArray = Array.from(messages.values()).reverse();

    // Generate HTML transcript
    const guild = interaction.guild;
    const html = generateHTMLTranscript(ticket, messageArray, guild, channel);

    // Save transcript URL
    transcriptUrl = getTranscriptUrl(ticket.id);

    // Store messages in database for web viewing
    const messageData = messageArray.map(msg => ({
      id: msg.id,
      content: msg.content,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        bot: msg.author.bot,
        displayAvatarURL: msg.author.displayAvatarURL({ size: 64 })
      },
      createdAt: msg.createdAt,
      createdTimestamp: msg.createdTimestamp,
      attachments: Array.from(msg.attachments.values()).map(att => ({
        url: att.url,
        name: att.name,
        contentType: att.contentType
      })),
      embeds: msg.embeds.map(embed => ({
        title: embed.title,
        description: embed.description,
        hexColor: embed.hexColor,
        fields: embed.fields
      }))
    }));

    // Save to a JSON file for the web server to read
    const fs = await import('fs');
    const path = await import('path');
    const transcriptDir = path.join(process.cwd(), 'transcripts');
    if (!fs.existsSync(transcriptDir)) {
      fs.mkdirSync(transcriptDir, { recursive: true });
    }
    const transcriptPath = path.join(transcriptDir, `${ticket.id}.json`);
    fs.writeFileSync(transcriptPath, JSON.stringify(messageData, null, 2));

    // Update ticket with transcript URL
    await Ticket.updateOne(
      { channelId: channel.id },
      {
        $set: {
          transcriptUrl: transcriptUrl,
          transcriptPath: transcriptPath
        }
      }
    );
  } catch (error) {
    console.error('Error generating transcript:', error);
  }

  // Use ISO string for dates
  await Ticket.updateOne(
    { channelId: channel.id },
    {
      $set: {
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: interaction.user.id,
        closeReason: reason
      }
    }
  );


  const baseName = getBaseChannelName(ticket);
  const closedName = `closed-${baseName}`;
  try {
    await channel.setName(closedName);
  } catch (error) {
    console.error('Error renaming channel:', error);
  }

  const reopenButton = new ButtonBuilder()
    .setCustomId('ticket_reopen')
    .setLabel('Reopen Ticket')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🔓');

  const deleteWithTranscriptButton = new ButtonBuilder()
    .setCustomId('ticket_delete_with_transcript')
    .setLabel('Delete with Transcript')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('📄');

  const row = new ActionRowBuilder()
    .addComponents(reopenButton, deleteWithTranscriptButton);

  let closeDescription = `This ticket has been closed by <@${interaction.user.id}>\n\n**Reason:** ${reason}`;
  if (transcriptUrl) {
    closeDescription += `\n\n📄 **[View Transcript](${transcriptUrl})**`;
  }

  const closeEmbed = new EmbedBuilder()
    .setTitle(`${emojis.lock} Ticket #${ticket.ticketNumber || 'Unknown'} Closed`)
    .setDescription(closeDescription)
    .setColor(colors.error)
    .setTimestamp();


  await channel.send({ embeds: [closeEmbed], components: [row] });

  // Send DM to ticket creator
  try {
    const ticketCreator = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    if (ticketCreator && !ticketCreator.user.bot) {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`🔴 Your Ticket Has Been Closed`)
        .setDescription(`Your ticket **#${ticket.ticketNumber}** in **${interaction.guild.name}** has been closed by staff.`)
        .addFields(
          { name: '📁 Category', value: ticket.category || 'Unknown', inline: true },
          { name: '👤 Closed By', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📝 Reason', value: reason || 'No reason provided', inline: false }
        )
        .setColor(colors.error)
        .setTimestamp();

      try {
        await ticketCreator.send({ embeds: [dmEmbed] });
        console.log(`[CLOSE] DM sent to ticket creator ${ticketCreator.user.tag}`);
      } catch (dmError) {
        console.log(`[CLOSE] Could not DM ticket creator (might have DMs disabled)`);
      }
    }
  } catch (dmErr) {
    console.error('[CLOSE] Error sending DM to ticket creator:', dmErr);
  }


  try {
    await channel.permissionOverwrites.delete(ticket.userId);
  } catch (e) {
    // Permission might not exist
  }


  // Get config for points settings
  let config = getCachedConfig(guildId);
  if (!config) {
    config = await Config.findOne({ guildId });
    if (config) setCachedConfig(guildId, config);
  }

  // Add points for closing ticket (only if points are enabled)
  const pointsEnabled = config?.pointsEnabled !== false;
  const pointsToAward = config?.pointsOnClose || 1;

  if (pointsEnabled && pointsToAward > 0) {
    try {
      await StaffPoints.addPoints(guildId, interaction.user.id, interaction.user.tag, pointsToAward, 'close');
    } catch (e) {
      console.error('[POINTS] Error adding close points:', e);
    }
  }

  if (config?.ticketLogChannelId) {
    const logChannel = await interaction.guild.channels.fetch(config.ticketLogChannelId).catch(() => null);

    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle(`${emojis.ticket} Ticket Closed`)
        .addFields(
          { name: 'Ticket #', value: ticket.ticketNumber?.toString() || 'Unknown', inline: true },
          { name: 'User', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Category', value: ticket.category || 'Unknown', inline: true },
          { name: 'Subject', value: ticket.subject || 'No subject', inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setColor(colors.error)
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] });
    }
  }

  await interaction.editReply({
    content: `${emojis.success} Ticket closed successfully! Channel renamed to ${closedName}`
  });

  // Refresh ticket panel so users can create new tickets
  try {
    await refreshTicketPanel(interaction.guild, config);
  } catch (err) {
    console.log('[PANEL] Could not refresh panel:', err.message);
  }
}

async function handleReopen(interaction, ticket, channel, guildId) {
  if (ticket.status !== 'closed') {
    return interaction.editReply({
      content: `${emojis.error} This ticket is not closed. Current status: ${ticket.status}`
    });
  }

  // Check if ticket is claimed by someone else - STRICT check
  const reopenCheck = await canReopenTicket(interaction, ticket);
  if (!reopenCheck.allowed) {
    return interaction.editReply({ content: reopenCheck.message });
  }

  // Use ISO string for dates
  await Ticket.updateOne(
    { channelId: channel.id },
    {
      $set: {
        status: 'open',
        reopenedAt: new Date().toISOString(),
        reopenedBy: interaction.user.id,
        closeReason: null,
        closedAt: null,
        closedBy: null
      }
    }
  );

  const baseName = getBaseChannelName(ticket);
  const reopenedName = `reopen-${baseName}`;
  try {
    await channel.setName(reopenedName);
  } catch (error) {
    console.error('Error renaming channel:', error);
  }

  try {
    const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    if (member) {
      await channel.permissionOverwrites.create(member, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      });
    }
  } catch (e) {
    console.error('Error restoring user permissions:', e);
  }

  const reopenEmbed = new EmbedBuilder()
    .setTitle(`${emojis.success} Ticket Reopened`)
    .setDescription(`This ticket has been reopened by <@${interaction.user.id}>`)
    .setColor(colors.success)
    .setTimestamp();

  await channel.send({ embeds: [reopenEmbed] });

  let config = getCachedConfig(guildId);
  if (!config) {
    config = await Config.findOne({ guildId });
    if (config) setCachedConfig(guildId, config);
  }

  if (config?.ticketLogChannelId) {
    const logChannel = await interaction.guild.channels.fetch(config.ticketLogChannelId).catch(() => null);

    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle(`${emojis.ticket} Ticket Reopened`)
        .addFields(
          { name: 'Ticket #', value: ticket.ticketNumber?.toString() || 'Unknown', inline: true },
          { name: 'User', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Reopened By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Category', value: ticket.category || 'Unknown', inline: true },
          { name: 'Subject', value: ticket.subject || 'No subject', inline: false }
        )
        .setColor(colors.success)
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] });
    }
  }

  await interaction.editReply({
    content: `${emojis.success} Ticket reopened successfully! Channel renamed to ${reopenedName}`
  });
}


async function handleClaim(interaction, ticket, channel, guildId) {
  if (ticket.status === 'closed') {
    return interaction.editReply({
      content: `${emojis.error} This ticket is closed. You cannot claim a closed ticket.`
    });
  }

  if (ticket.claimedBy) {
    if (ticket.claimedBy === interaction.user.id) {
      return interaction.editReply({
        content: `${emojis.error} You have already claimed this ticket.`
      });
    }

    const claimedByUser = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
    const claimedByName = claimedByUser ? claimedByUser.user.tag : 'Another staff member';

    return interaction.editReply({
      content: `${emojis.error} This ticket is already claimed by **${claimedByName}**.`
    });
  }

  await Ticket.updateOne(
    { channelId: channel.id },
    { $set: { claimedBy: interaction.user.id, status: 'in_progress' } }
  );

  const claimEmbed = new EmbedBuilder()
    .setTitle(`${emojis.success} Ticket Claimed`)
    .setDescription(`This ticket has been claimed by <@${interaction.user.id}>`)
    .setColor(colors.success)
    .setTimestamp();

  await channel.send({ embeds: [claimEmbed] });

  await interaction.editReply({
    content: `${emojis.success} Ticket claimed successfully!`
  });
}

async function handleAdd(interaction, ticket, channel) {
  const user = interaction.options.getUser('user');

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    return interaction.editReply({
      content: `${emojis.error} User not found in the server.`
    });
  }

  await channel.permissionOverwrites.create(member, {
    ViewChannel: true,
    SendMessages: true,
    AttachFiles: true,
    ReadMessageHistory: true
  });

  const participants = ticket.participants || [];
  if (!participants.includes(user.id)) {
    participants.push(user.id);
    await Ticket.updateOne(
      { channelId: channel.id },
      { $set: { participants } }
    );
  }

  const addEmbed = new EmbedBuilder()
    .setTitle(`${emojis.success} User Added`)
    .setDescription(`<@${user.id}> has been added to this ticket`)
    .setColor(colors.success)
    .setTimestamp();

  await channel.send({ embeds: [addEmbed] });

  await interaction.editReply({
    content: `${emojis.success} ${user.tag} added to the ticket!`
  });
}

async function handleRemove(interaction, ticket, channel) {
  const user = interaction.options.getUser('user');

  try {
    await channel.permissionOverwrites.delete(user.id);
  } catch (e) {
    // Permission might not exist
  }

  const participants = ticket.participants || [];
  const newParticipants = participants.filter(p => p !== user.id);

  await Ticket.updateOne(
    { channelId: channel.id },
    { $set: { participants: newParticipants } }
  );

  const removeEmbed = new EmbedBuilder()
    .setTitle(`${emojis.success} User Removed`)
    .setDescription(`<@${user.id}> has been removed from this ticket`)
    .setColor(colors.warning)
    .setTimestamp();

  await channel.send({ embeds: [removeEmbed] });

  await interaction.editReply({
    content: `${emojis.success} ${user.tag} removed from the ticket!`
  });
}

async function handleAssign(interaction, ticket, channel) {
  const user = interaction.options.getUser('user');

  await Ticket.updateOne(
    { channelId: channel.id },
    { $set: { assignedTo: user.id, status: 'in_progress' } }
  );

  const assignEmbed = new EmbedBuilder()
    .setTitle(`${emojis.success} Ticket Assigned`)
    .setDescription(`This ticket has been assigned to <@${user.id}>`)
    .setColor(colors.success)
    .setTimestamp();

  await channel.send({ embeds: [assignEmbed] });

  await interaction.editReply({
    content: `${emojis.success} Ticket assigned to ${user.tag} successfully!`
  });
}
