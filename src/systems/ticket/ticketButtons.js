import { EmbedBuilder, PermissionFlagsBits, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import Ticket from '../../database/models/Ticket.js';
import Config from '../../database/models/Config.js';
import Category from '../../database/models/Category.js';
import StaffPoints from '../../database/models/StaffPoints.js';

import { generateHTMLTranscript } from './transcriptGenerator.js';
import { getTranscriptUrl } from './transcriptServer.js';

import colors from '../../config/colors.js';
import emojis from '../../config/emojis.js';

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
    return { ...cached.data };
  }
  return null;
}

function setCachedConfig(guildId, config) {
  configCache.set(guildId, { data: config, time: Date.now() });
}

export function clearConfigCache(guildId) {
  configCache.delete(guildId);
  console.log(`[CACHE] Cleared config cache for guild ${guildId}`);
}

// Fast staff check - now also checks category-specific staff roles
function isStaffFast(member, config, category = null) {
  if (!member) {
    console.log('[STAFF CHECK] No member provided');
    return false;
  }
  
  // Check admin permission first (fastest)
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    console.log('[STAFF CHECK] User has Administrator permission');
    return true;
  }
  
  // Check category-specific staff roles first (if category provided)
  if (category && category.staffRoleIds && category.staffRoleIds.length > 0) {
    console.log('[STAFF CHECK] Checking category staff roles:', category.staffRoleIds);
    const hasCategoryStaffRole = category.staffRoleIds.some(roleId => 
      member.roles.cache.has(roleId)
    );
    console.log('[STAFF CHECK] Has category staff role:', hasCategoryStaffRole);
    if (hasCategoryStaffRole) {
      console.log('[STAFF CHECK] User has category-specific staff role');
      return true;
    }
  }
  
  // Check staff roles from global config
  if (config) {
    console.log('[STAFF CHECK] Config found:', {
      staffRoleId: config.staffRoleId,
      adminRoleId: config.adminRoleId,
      userRoles: Array.from(member.roles.cache.keys())
    });
    
    if (config.staffRoleId && member.roles.cache.has(config.staffRoleId)) {
      console.log('[STAFF CHECK] User has global staff role');
      return true;
    }
    if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) {
      console.log('[STAFF CHECK] User has admin role');
      return true;
    }
    
    console.log('[STAFF CHECK] User does not have required roles');
  } else {
    console.log('[STAFF CHECK] No config provided');
  }
  
  return false;
}

// Ultra-fast staff check for reopen (no category fetch needed)
function isStaffFastBasic(member, config) {
  if (!member) return false;
  
  // Check admin permission first (fastest)
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  
  // Check staff roles from global config only
  if (config) {
    if (config.staffRoleId && member.roles.cache.has(config.staffRoleId)) {
      return true;
    }
    if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) {
      return true;
    }
  }
  
  return false;
}

// Helper to check if user can close a claimed ticket
async function canCloseTicket(interaction, ticket) {
  // If not claimed, anyone with staff perms can close
  if (!ticket.claimedBy) {
    return { allowed: true };
  }
  
  // If claimed by the user themselves, they can close
  if (ticket.claimedBy === interaction.user.id) {
    return { allowed: true };
  }
  
  // If user is admin, they can close any ticket
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return { allowed: true };
  }
  
  // Otherwise, only the claimer can close
  const claimedByUser = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
  const claimedByName = claimedByUser ? claimedByUser.user.tag : 'Another staff member';
  
  return { 
    allowed: false, 
    message: `${emojis.error} This ticket is claimed by **${claimedByName}**. Only they or an administrator can close it.`
  };
}

export async function handleCloseButton(interaction) {
  try {
    const modal = new ModalBuilder()
      .setCustomId('ticket_close_modal')
      .setTitle('Close Ticket');

    const reasonInput = new TextInputBuilder()
      .setCustomId('close_reason')
      .setLabel('Close Reason (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter reason for closing this ticket...')
      .setRequired(false)
      .setMaxLength(500);

    const row = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error handling close button:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `${emojis.error} An error occurred.`,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (e) {
      // Ignore if we can't reply
    }
  }
}

export async function handleCloseModal(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.user;
    const closeReason = interaction.fields.getTextInputValue('close_reason') || 'Closed via button';

    let ticket = getCachedTicket(channel.id);
    let config = getCachedConfig(guild.id);
    
    if (!ticket) {
      ticket = await Ticket.findByChannelId(channel.id);
      if (ticket) setCachedTicket(channel.id, ticket);
    }
    
    if (!config) {
      config = await Config.findOne({ guildId: guild.id });
      if (config) setCachedConfig(guild.id, config);
    }

    if (!ticket) {
      return interaction.editReply({
        content: `${emojis.error} This channel is not a ticket channel.`
      });
    }

    // Fetch category for staff check
    let category = null;
    if (ticket.categoryId) {
      category = await Category.findById(ticket.categoryId);
    }
    
    if (!isStaffFast(interaction.member, config, category)) {
      return interaction.editReply({
        content: `${emojis.error} Only staff members can close tickets.`
      });
    }

    // Check if already closed
    if (ticket.status === 'closed') {
      return interaction.editReply({
        content: `${emojis.error} This ticket is already closed, please reopen or delete with reason`
      });
    }

    // Check if ticket is claimed by someone else
    const closeCheck = await canCloseTicket(interaction, ticket);
    if (!closeCheck.allowed) {
      return interaction.editReply({ content: closeCheck.message });
    }

    await Ticket.updateOne(
      { channelId: channel.id },
      { 
        $set: { 
          status: 'closed',
          closedAt: new Date().toISOString(),
          closedBy: user.id,
          closeReason: closeReason
        }
      }
    );

    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closedBy = user.id;
    ticket.closeReason = closeReason;
    setCachedTicket(channel.id, ticket);

    const baseName = extractBaseChannelName(channel.name);
    const newChannelName = `closed-${baseName}`;
    await channel.setName(newChannelName).catch(() => {});

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

    const transcriptInfo = config?.transcriptChannelId 
      ? `📄 Transcript will be saved to <#${config.transcriptChannelId}>`
      : '📄 Transcript saved locally';

    const closeEmbed = new EmbedBuilder()
      .setTitle(`${emojis.lock} Ticket #${ticket.ticketNumber || 'Unknown'} Closed`)
      .setDescription(`This ticket has been closed by ${user}`)
      .addFields(
        { name: '👤 Closed By', value: `<@${user.id}>`, inline: true },
        { name: '📁 Category', value: ticket.category || 'Unknown', inline: true },
        { name: '🔢 Ticket Number', value: `#${ticket.ticketNumber || 'Unknown'}`, inline: true },
        { name: '📝 Reason', value: closeReason || 'No reason provided', inline: false },
        { name: '📋 Logs', value: transcriptInfo, inline: false }
      )
      .setColor(colors.error)
      .setTimestamp();

    await channel.send({ embeds: [closeEmbed], components: [row] });

    // Send DM to ticket creator
    try {
      const ticketCreator = await guild.members.fetch(ticket.userId).catch(() => null);
      if (ticketCreator && !ticketCreator.user.bot) {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`🔴 Your Ticket Has Been Closed`)
          .setDescription(`Your ticket **#${ticket.ticketNumber}** in **${guild.name}** has been closed by staff.`)
          .addFields(
            { name: '📁 Category', value: ticket.category || 'Unknown', inline: true },
            { name: '👤 Closed By', value: `<@${user.id}>`, inline: true },
            { name: '📝 Reason', value: closeReason || 'No reason provided', inline: false }
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


    // Send log to ticket log channel
    if (config?.ticketLogChannelId) {
      console.log(`[CLOSE] Sending log to channel: ${config.ticketLogChannelId}`);
      
      const logChannel = await guild.channels.fetch(config.ticketLogChannelId).catch((err) => {
        console.error(`[CLOSE] Error fetching log channel:`, err.message);
        return null;
      });
      
      if (logChannel) {
        console.log(`[CLOSE] Log channel found: ${logChannel.name}`);
        
        // Check permissions
        const botMember = guild.members.me;
        const canSend = logChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages);
        console.log(`[CLOSE] Bot can send messages: ${canSend}`);
        
        const logEmbed = new EmbedBuilder()
          .setTitle(`${emojis.lock} Ticket Closed`)
          .addFields(
            { name: 'Ticket #', value: ticket.ticketNumber?.toString() || 'Unknown', inline: true },
            { name: 'User', value: ticket.userId ? `<@${ticket.userId}>` : 'Unknown', inline: true },
            { name: 'Closed By', value: `<@${user.id}>`, inline: true },
            { name: 'Category', value: ticket.category || 'Unknown', inline: true },
            { name: 'Reason', value: closeReason || 'No reason provided', inline: false }
          )
          .setColor(colors.warning)
          .setTimestamp();

        try {
          await logChannel.send({ embeds: [logEmbed] });
          console.log(`[CLOSE] ✓ Log message sent successfully!`);
        } catch (err) {
          console.error(`[CLOSE] ✗ Error sending log message:`, err.message);
        }
      } else {
        console.log(`[CLOSE] ✗ Log channel not found or bot lacks access`);
      }
    } else {
      console.log(`[CLOSE] ✗ No ticketLogChannelId configured`);
    }


    try {
      if (ticket.userId) {
        await channel.permissionOverwrites.delete(ticket.userId);
      }
    } catch (e) {
      // Permission might not exist
    }


    await interaction.editReply({
      content: `${emojis.success} Ticket #${ticket.ticketNumber || 'unknown'} closed successfully!`
    });

  } catch (error) {
    console.error('Error closing ticket:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${emojis.error} An error occurred while closing the ticket.`
        });
      }
    } catch (e) {
      console.error('Could not send error reply:', e);
    }
  }
}

export async function handleReopenButton(interaction) {
  const startTime = Date.now();
  const channel = interaction.channel;
  const guild = interaction.guild;
  const user = interaction.user;
  
  try {
    // DEFER IMMEDIATELY - must be within 3 seconds
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // FAST PATH: Use cache first
    let ticket = getCachedTicket(channel.id);
    let config = getCachedConfig(guild.id);
    
    if (!ticket) {
      // Use findByChannelId - it's synchronous with SQLite
      ticket = Ticket.findByChannelId(channel.id);
      if (ticket) setCachedTicket(channel.id, ticket);
    }

    if (!ticket) {
      return interaction.editReply({
        content: `${emojis.error} This channel is not a ticket channel.`
      });
    }

    // FAST staff check - no category fetch needed for reopen
    const isStaff = isStaffFastBasic(interaction.member, config);
    
    if (!isStaff) {
      // Only fetch config if needed
      if (!config) {
        config = await Config.findOne({ guildId: guild.id });
        if (config) setCachedConfig(guild.id, config);
      }
      
      // Recheck with fetched config
      const recheck = isStaffFastBasic(interaction.member, config);
      
      if (!recheck) {
        return interaction.editReply({
          content: `${emojis.error} Only staff members can reopen tickets.`
        });
      }
    }

    // Check if already open
    const isActuallyOpen = ticket.status && ticket.status !== 'closed';
    const hasClosedPrefix = channel.name.toLowerCase().startsWith('closed-');
    
    if (isActuallyOpen && !hasClosedPrefix) {
      return interaction.editReply({
        content: `${emojis.error} This ticket is already open.`
      });
    }

    // Prepare updates
    const now = new Date();
    const updateData = { 
      status: 'open',
      reopenedAt: now.toISOString(),
      reopenedBy: user.id,
      closeReason: null,
      closedAt: null,
      closedBy: null
    };

    // Update ticket and rename channel in parallel
    const baseName = extractBaseChannelName(channel.name);
    await Promise.all([
      Ticket.updateOne({ channelId: channel.id }, { $set: updateData }),
      channel.setName(baseName).catch(() => {})
    ]);

    // Update cache immediately
    Object.assign(ticket, updateData);
    setCachedTicket(channel.id, ticket);

    // Reply immediately - don't wait for other operations
    await interaction.editReply({
      content: `${emojis.success} Ticket #${ticket.ticketNumber || 'Unknown'} reopened!`
    });

    // Fire-and-forget: Restore user access (don't await)
    if (ticket.userId) {
      channel.permissionOverwrites.create(ticket.userId, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true,
      }).catch(() => {});
    }

    // Fire-and-forget: Send reopen message (don't await)
    const reopenEmbed = new EmbedBuilder()
      .setTitle(`${emojis.success} Ticket #${ticket.ticketNumber || 'Unknown'} Reopened`)
      .setDescription(`This ticket has been reopened by ${user}`)
      .setColor(colors.success)
      .setTimestamp();

    channel.send({ embeds: [reopenEmbed] }).catch(() => {});

    console.log(`[REOPEN] Total time: ${Date.now() - startTime}ms`);

  } catch (error) {
    console.error('Error reopening ticket:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${emojis.error} An error occurred.`
        });
      }
    } catch (e) {
      console.error('Could not send error reply:', e);
    }
  }
}

export async function handleClaimButton(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.user;

    let ticket = getCachedTicket(channel.id);
    let config = getCachedConfig(guild.id);
    
    if (!ticket) {
      ticket = await Ticket.findByChannelId(channel.id);
      if (ticket) setCachedTicket(channel.id, ticket);
    }

    if (!ticket) {
      return interaction.editReply({
        content: `${emojis.error} This channel is not a ticket channel.`
      });
    }

    // Fetch category for staff check
    let category = null;
    if (ticket.categoryId) {
      category = await Category.findById(ticket.categoryId);
    }
    
    // Fast staff check with category
    if (!isStaffFast(interaction.member, config, category)) {
      if (!config) {
        config = await Config.findOne({ guildId: guild.id });
        if (config) setCachedConfig(guild.id, config);
      }
      if (!category && ticket.categoryId) {
        category = await Category.findById(ticket.categoryId);
      }
      if (!isStaffFast(interaction.member, config, category)) {
        return interaction.editReply({
          content: `${emojis.error} Only staff members can claim tickets.`
        });
      }
    }

    if (ticket.status === 'closed') {
      return interaction.editReply({
        content: `${emojis.error} This ticket is closed. You cannot claim a closed ticket.`
      });
    }

    if (ticket.claimedBy) {
      if (ticket.claimedBy === user.id) {
        return interaction.editReply({
          content: `${emojis.error} You have already claimed this ticket.`
        });
      }
      
      const claimedByUser = await guild.members.fetch(ticket.claimedBy).catch(() => null);
      const claimedByName = claimedByUser ? claimedByUser.user.tag : 'Another staff member';
      
      return interaction.editReply({
        content: `${emojis.error} This ticket is already claimed by **${claimedByName}**.`
      });
    }

    await Ticket.updateOne(
      { channelId: channel.id },
      { $set: { claimedBy: user.id, status: 'in_progress' } }
    );

    ticket.claimedBy = user.id;
    ticket.status = 'in_progress';
    setCachedTicket(channel.id, ticket);

    const claimEmbed = new EmbedBuilder()
      .setTitle(`${emojis.success} Ticket Claimed`)
      .setDescription(`This ticket has been claimed by ${user}`)
      .setColor(colors.success)
      .setTimestamp();

    await channel.send({ embeds: [claimEmbed] });

    await interaction.editReply({
      content: `${emojis.success} Ticket claimed successfully!`
    });

  } catch (error) {
    console.error('Error claiming ticket:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${emojis.error} An error occurred: ${error.message}`
        });
      }
    } catch (e) {
      console.error('Could not send error reply:', e);
    }
  }
}

export async function handleTranscriptButton(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const channel = interaction.channel;
    const guild = interaction.guild;

    let ticket = getCachedTicket(channel.id);
    let config = getCachedConfig(guild.id);
    
    if (!ticket) {
      ticket = await Ticket.findByChannelId(channel.id);
      if (ticket) setCachedTicket(channel.id, ticket);
    }

    if (!ticket) {
      return interaction.editReply({
        content: `${emojis.error} This channel is not a ticket channel.`
      });
    }

    // Fetch category for staff check
    let category = null;
    if (ticket.categoryId) {
      category = await Category.findById(ticket.categoryId);
    }
    
    if (!isStaffFast(interaction.member, config, category)) {
      if (!config) {
        config = await Config.findOne({ guildId: guild.id });
        if (config) setCachedConfig(guild.id, config);
      }
      if (!category && ticket.categoryId) {
        category = await Category.findById(ticket.categoryId);
      }
      if (!isStaffFast(interaction.member, config, category)) {
        return interaction.editReply({
          content: `${emojis.error} Only staff members can generate transcripts.`
        });
      }
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    let transcript = `# Ticket #${ticket.ticketNumber} - ${ticket.subject}\n`;
    transcript += `Category: ${ticket.category}\n`;
    transcript += `User: ${ticket.username}\n`;
    transcript += `Opened: ${ticket.openedAt}\n`;
    transcript += `Status: ${ticket.status}\n`;
    transcript += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const msg of sortedMessages) {
      const author = msg.author.bot ? 'Bot' : msg.author.username;
      const content = msg.content || '[No text content]';
      const timestamp = msg.createdAt.toISOString();
      transcript += `[${timestamp}] ${author}: ${content}\n`;
    }

    await interaction.editReply({
      content: `${emojis.success} Transcript generated!`,
      files: [{
        attachment: Buffer.from(transcript),
        name: `ticket-${ticket.ticketNumber}.txt`
      }]
    });

  } catch (error) {
    console.error('Error generating transcript:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${emojis.error} An error occurred.`
        });
      }
    } catch (e) {
      console.error('Could not send error reply:', e);
    }
  }
}

export async function handleDeleteButton(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.user;

    let ticket = getCachedTicket(channel.id);
    let config = getCachedConfig(guild.id);
    
    if (!ticket) {
      ticket = await Ticket.findByChannelId(channel.id);
      if (ticket) setCachedTicket(channel.id, ticket);
    }

    if (!ticket) {
      return interaction.editReply({
        content: `${emojis.error} This channel is not a ticket channel.`
      });
    }

    // Fetch category for staff check
    let category = null;
    if (ticket.categoryId) {
      category = await Category.findById(ticket.categoryId);
    }
    
    if (!isStaffFast(interaction.member, config, category)) {
      if (!config) {
        config = await Config.findOne({ guildId: guild.id });
        if (config) setCachedConfig(guild.id, config);
      }
      if (!category && ticket.categoryId) {
        category = await Category.findById(ticket.categoryId);
      }
      if (!isStaffFast(interaction.member, config, category)) {
        return interaction.editReply({
          content: `${emojis.error} Only staff members can delete tickets.`
        });
      }
    }

    // Check if ticket is claimed by someone else
    const closeCheck = await canCloseTicket(interaction, ticket);
    if (!closeCheck.allowed) {
      return interaction.editReply({ content: closeCheck.message });
    }

    await Ticket.updateOne(
      { channelId: channel.id },
      { 
        $set: { 
          status: 'closed',
          closedAt: new Date().toISOString(),
          closedBy: user.id,
          closeReason: 'Deleted via button'
        }
      }
    );

    if (config?.ticketLogChannelId) {
      const logChannel = await guild.channels.fetch(config.ticketLogChannelId).catch(() => null);
      
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`${emojis.danger} Ticket Deleted`)
          .addFields(
            { name: 'Ticket #', value: ticket.ticketNumber?.toString() || 'Unknown', inline: true },
            { name: 'User', value: `<@${ticket.userId}>`, inline: true },
            { name: 'Deleted By', value: `<@${user.id}>`, inline: true },
            { name: 'Category', value: ticket.category || 'Unknown', inline: true }
          )
          .setColor(colors.error)
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    }

    await channel.delete();

  } catch (error) {
    console.error('Error deleting ticket:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${emojis.error} An error occurred.`
        });
      }
    } catch (e) {
      console.error('Could not send error reply:', e);
    }
  }
}

export async function handleAddUserButton(interaction) {
  try {
    const channel = interaction.channel;
    const guild = interaction.guild;

    let ticket = getCachedTicket(channel.id);
    let config = getCachedConfig(guild.id);
    
    if (!ticket) {
      ticket = await Ticket.findByChannelId(channel.id);
      if (ticket) setCachedTicket(channel.id, ticket);
    }

    if (!ticket) {
      return interaction.reply({
        content: `${emojis.error} This channel is not a ticket channel.`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (ticket.status === 'closed') {
      return interaction.reply({
        content: `${emojis.error} This ticket is closed. You cannot add users to a closed ticket.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Fetch category for staff check
    let category = null;
    if (ticket.categoryId) {
      category = await Category.findById(ticket.categoryId);
    }
    
    if (!isStaffFast(interaction.member, config, category)) {
      if (!config) {
        config = await Config.findOne({ guildId: guild.id });
        if (config) setCachedConfig(guild.id, config);
      }
      if (!category && ticket.categoryId) {
        category = await Category.findById(ticket.categoryId);
      }
      if (!isStaffFast(interaction.member, config, category)) {
        return interaction.reply({
          content: `${emojis.error} Only staff members can add users to tickets.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    const modal = new ModalBuilder()
      .setCustomId('ticket_adduser_modal')
      .setTitle('Add User to Ticket');

    const userInput = new TextInputBuilder()
      .setCustomId('user_id')
      .setLabel('User ID or @Mention')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter user ID or @username')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(userInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error showing add user modal:', error);
    await interaction.reply({
      content: `${emojis.error} An error occurred.`,
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
  }
}

export async function handleAddUserModal(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const channel = interaction.channel;
    const guild = interaction.guild;
    const userInput = interaction.fields.getTextInputValue('user_id');

    let userId = userInput.replace(/[<@!>]/g, '').trim();

    let targetUser;
    try {
      targetUser = await guild.members.fetch(userId);
    } catch (e) {
      return interaction.editReply({
        content: `${emojis.error} User not found. Please provide a valid user ID or mention.`
      });
    }

    await channel.permissionOverwrites.create(targetUser.id, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      ReadMessageHistory: true,
    });

    let ticket = getCachedTicket(channel.id);
    if (!ticket) {
      ticket = await Ticket.findByChannelId(channel.id);
    }

    if (ticket) {
      const participants = ticket.participants || [];
      if (!participants.includes(targetUser.id)) {
        participants.push(targetUser.id);
        await Ticket.updateOne(
          { channelId: channel.id },
          { $set: { participants: participants } }
        );
        ticket.participants = participants;
        setCachedTicket(channel.id, ticket);
      }
    }

    const addEmbed = new EmbedBuilder()
      .setTitle(`${emojis.success} User Added`)
      .setDescription(`${targetUser} has been added to this ticket.`)
      .setColor(colors.success)
      .setTimestamp();

    await channel.send({ embeds: [addEmbed] });

    await interaction.editReply({
      content: `${emojis.success} User added successfully!`
    });

  } catch (error) {
    console.error('Error adding user:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${emojis.error} An error occurred while adding the user.`
        });
      }
    } catch (e) {
      console.error('Could not send error reply:', e);
    }
  }
}

export async function handleDeleteWithTranscriptButton(interaction) {
  try {
    const modal = new ModalBuilder()
      .setCustomId('ticket_delete_transcript_modal')
      .setTitle('Delete Ticket with Transcript');

    const reasonInput = new TextInputBuilder()
      .setCustomId('delete_reason')
      .setLabel('Delete Reason (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter reason for deleting this ticket...')
      .setRequired(false)
      .setMaxLength(500);

    const row = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error showing delete transcript modal:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `${emojis.error} An error occurred.`,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (e) {
      // Ignore if we can't reply
    }
  }
}

export async function handleDeleteTranscriptModal(interaction) {


  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.user;

    console.log(`[TRANSCRIPT] Fetching fresh config for guild ${guild.id}`);
    let config = await Config.findOne({ guildId: guild.id });
    if (config) {
      setCachedConfig(guild.id, config);
      console.log(`[TRANSCRIPT] Fresh config fetched:`, {
        transcriptChannelId: config.transcriptChannelId,
        ticketLogChannelId: config.ticketLogChannelId
      });
    } else {
      console.log(`[TRANSCRIPT] No config found for guild ${guild.id}`);
    }
    
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

    // Fetch category for staff check
    let category = null;
    if (ticket.categoryId) {
      category = await Category.findById(ticket.categoryId);
    }
    
    if (!isStaffFast(interaction.member, config, category)) {
      return interaction.editReply({
        content: `${emojis.error} Only staff members can delete tickets.`
      });
    }

    // Check if ticket is claimed by someone else
    const closeCheck = await canCloseTicket(interaction, ticket);
    if (!closeCheck.allowed) {
      return interaction.editReply({ content: closeCheck.message });
    }

    await interaction.editReply({
      content: `${emojis.loading} Generating transcript...`
    });

    const messages = await channel.messages.fetch({ limit: 100 });
    console.log(`[TRANSCRIPT] Fetched ${messages.size} messages from channel`);
    console.log(`[TRANSCRIPT] Messages type: ${typeof messages}`);
    console.log(`[TRANSCRIPT] Messages is Map: ${messages instanceof Map}`);
    console.log(`[TRANSCRIPT] Messages has values: ${typeof messages.values === 'function'}`);
    
    const messageArray = Array.from(messages.values());
    console.log(`[TRANSCRIPT] Message array length: ${messageArray.length}`);
    console.log(`[TRANSCRIPT] Message array type: ${typeof messageArray}`);
    console.log(`[TRANSCRIPT] Message array is array: ${Array.isArray(messageArray)}`);
    
    if (messageArray.length > 0) {
      console.log(`[TRANSCRIPT] First message:`, JSON.stringify({
        id: messageArray[0].id,
        author: messageArray[0].author?.username,
        content: messageArray[0].content?.substring(0, 50),
        createdAt: messageArray[0].createdAt
      }));
    }
    
    console.log(`[TRANSCRIPT] Calling generateHTMLTranscript with ${messageArray.length} messages`);
    const htmlContent = generateHTMLTranscript(ticket, messageArray, guild, channel);
    console.log(`[TRANSCRIPT] generateHTMLTranscript returned, HTML length: ${htmlContent?.length || 0}`);

    // Save messages to JSON file for transcript server
    const fs = await import('fs');
    const path = await import('path');
    const transcriptsDir = path.join(process.cwd(), 'transcripts');
    
    // Create transcripts directory if it doesn't exist
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    // Save messages as JSON
    const messagesData = messageArray.map(msg => ({
      id: msg.id,
      content: msg.content,
      createdAt: msg.createdAt,
      createdTimestamp: msg.createdTimestamp,
      author: {
        username: msg.author.username,
        bot: msg.author.bot,
        system: msg.author.system,
        displayAvatarURL: msg.author.displayAvatarURL({ size: 128 })
      },
      attachments: Array.from(msg.attachments.values()).map(att => ({
        url: att.url,
        name: att.name,
        contentType: att.contentType,
        size: att.size
      })),
      embeds: msg.embeds.map(embed => ({
        title: embed.title,
        description: embed.description,
        hexColor: embed.hexColor,
        fields: embed.fields,
        author: embed.author,
        image: embed.image,
        thumbnail: embed.thumbnail,
        footer: embed.footer
      }))
    }));
    
    const jsonFileName = `ticket-${ticket.id}.json`;
    const jsonFilePath = path.join(transcriptsDir, jsonFileName);
    fs.writeFileSync(jsonFilePath, JSON.stringify(messagesData, null, 2));
    console.log(`[TRANSCRIPT] Saved ${messagesData.length} messages to ${jsonFilePath}`);

    const transcriptBuffer = Buffer.from(htmlContent, 'utf-8');

    let transcriptUrl = null;
    let transcriptSent = false;
    
    const safeTicketNumber = ticket.ticketNumber || 'unknown';
    const safeCategory = (ticket.category || 'unknown').toLowerCase().replace(/\s+/g, '-');
    const fileName = `ticket-${safeTicketNumber}-${safeCategory}.html`;

    
    // Use local transcript server (PebbleHost compatible)
    console.log(`[TRANSCRIPT] Using local transcript server...`);
    transcriptUrl = getTranscriptUrl(ticket.id);
    console.log(`[TRANSCRIPT] Local URL: ${transcriptUrl}`);


    
    console.log(`[TRANSCRIPT] Config:`, {

      transcriptChannelId: config?.transcriptChannelId,
      ticketLogChannelId: config?.ticketLogChannelId,
      guildId: guild.id
    });
    
    const targetChannelId = config?.transcriptChannelId || config?.ticketLogChannelId;
    
    console.log(`[TRANSCRIPT] Target channel ID: ${targetChannelId}`);
    
    if (targetChannelId) {
      const targetChannel = await guild.channels.fetch(targetChannelId).catch((err) => {
        console.error(`[TRANSCRIPT] Error fetching channel ${targetChannelId}:`, err);
        return null;
      });
      
      if (targetChannel) {
        try {
          const transcriptEmbed = new EmbedBuilder()
            .setTitle(`${emojis.ticket} Ticket #${ticket.ticketNumber || 'Unknown'} Transcript`)
            .setDescription(`Transcript for ticket closed by ${user}`)
            .addFields(
              { name: 'Category', value: ticket.category || 'Unknown', inline: true },
              { name: 'Created By', value: ticket.username || 'Unknown', inline: true },
              { name: 'Closed By', value: user?.id ? `<@${user.id}>` : 'Unknown', inline: true },
              { name: 'Subject', value: ticket.subject || 'No subject', inline: false }
            )
            .setColor(colors.primary)
            .setTimestamp();

          // Create button to view transcript online
          const viewTranscriptButton = new ButtonBuilder()
            .setLabel('View Transcript Online')
            .setStyle(ButtonStyle.Link)
            .setURL(transcriptUrl || 'https://example.com')
            .setEmoji('🌐');

          const buttonRow = new ActionRowBuilder()
            .addComponents(viewTranscriptButton);

          console.log(`[TRANSCRIPT] Sending transcript notification to channel ${targetChannelId}...`);
          
          await targetChannel.send({
            embeds: [transcriptEmbed],
            components: [buttonRow]
          });

          console.log(`[TRANSCRIPT] Transcript notification sent successfully!`);


          transcriptSent = true;
          
        } catch (sendError) {
          console.error(`[TRANSCRIPT] Error sending transcript:`, sendError);
        }
      } else {
        console.error(`[TRANSCRIPT] Channel ${targetChannelId} not found or bot lacks permissions`);
      }
    } else {
      console.error(`[TRANSCRIPT] No transcript channel configured`);
    }



    await Ticket.updateOne(
      { channelId: channel.id },
      { 
        $set: { 
          status: 'closed',
          closedAt: new Date().toISOString(),
          closedBy: user.id,
          closeReason: 'Deleted with transcript',
          transcriptUrl: transcriptUrl,
          transcriptPath: jsonFilePath


        }
      }
    );


    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closedBy = user.id;
    ticket.closeReason = 'Deleted with transcript';
    ticket.transcriptUrl = transcriptUrl;
    ticket.transcriptPath = jsonFilePath;



    setCachedTicket(channel.id, ticket);


    await interaction.editReply({
      content: `${emojis.success} Transcript ${transcriptSent ? 'generated and sent' : 'generated but failed to send'}! Deleting ticket...`
    });

    if (config?.ticketLogChannelId) {
      const logChannel = await guild.channels.fetch(config.ticketLogChannelId).catch(() => null);
      
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`${emojis.danger} Ticket Deleted with Transcript`)
          .addFields(
            { name: 'Ticket #', value: ticket.ticketNumber?.toString() || 'Unknown', inline: true },
            { name: 'User', value: ticket.userId ? `<@${ticket.userId}>` : 'Unknown', inline: true },
            { name: 'Deleted By', value: user.id ? `<@${user.id}>` : 'Unknown', inline: true },
            { name: 'Category', value: ticket.category || 'Unknown', inline: true },
            { name: 'Transcript', value: transcriptUrl ? `[View Transcript](${transcriptUrl})` : 'Failed to send', inline: false }

          )
          .setColor(colors.error)
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] }).catch(err => {
          console.error(`[TRANSCRIPT] Error sending log message:`, err);
        });
      }
    }


    setTimeout(async () => {
      try {
        await channel.delete();
      } catch (error) {
        console.error('Error deleting channel:', error);
      }
    }, 2000);

  } catch (error) {
    console.error('Error deleting with transcript:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${emojis.error} An error occurred: ${error.message}`
        });
      }
    } catch (e) {
      console.error('Could not send error reply:', e);
    }
  }
}

function extractBaseChannelName(channelName) {
  const match = channelName.match(/^(?:closed-|reopen-)+(.+?-\d+)$/i);
  if (match) {
    return match[1];
  }
  return channelName.replace(/^(closed-|reopen-)+/i, '');
}
