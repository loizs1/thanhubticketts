import { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import Ticket from '../../database/models/Ticket.js';
import Config from '../../database/models/Config.js';
import Category from '../../database/models/Category.js';


import colors from '../../config/colors.js';
import emojis from '../../config/emojis.js';

// Simple in-memory cache
const categoryCache = new Map();
const configCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCachedCategory(guildId, name) {
  const key = `${guildId}-${name}`;
  const cached = categoryCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedCategory(guildId, name, category) {
  const key = `${guildId}-${name}`;
  categoryCache.set(key, { data: category, time: Date.now() });
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


export async function handleCategorySelect(interaction) {
  try {
    const categoryName = interaction.values[0];
    const guildId = interaction.guild.id;
    
    // Fetch category to check for custom modal fields
    // This should be fast - we have caching in place
    let category = getCachedCategory(guildId, categoryName);
    
    if (!category) {
      category = await Category.findOne({
        guildId: guildId,
        name: categoryName
      }).first();
      
      if (category) {
        setCachedCategory(guildId, categoryName, category);
      }
    }

    // Build modal
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${categoryName}`)
      .setTitle(`${categoryName} Ticket`);

    // Check if category has custom modal fields
    if (category && category.modalFields && category.modalFields.length > 0) {
      // Use custom modal fields
      const components = [];
      
      for (const field of category.modalFields.slice(0, 5)) { // Max 5 fields
        const textInput = new TextInputBuilder()
          .setCustomId(field.label.toLowerCase().replace(/\s+/g, '_').substring(0, 20))
          .setLabel(field.label.substring(0, 45)) // Max 45 chars for label
          .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setPlaceholder((field.placeholder || 'Enter your response...').substring(0, 100))
          .setRequired(field.required !== false)
          .setMinLength(field.minLength || 0)
          .setMaxLength(field.maxLength || (field.style === 'paragraph' ? 4000 : 100));
        
        const row = new ActionRowBuilder().addComponents(textInput);
        components.push(row);
      }
      
      modal.addComponents(...components);
    } else {
      // Use default modal fields
      const subjectInput = new TextInputBuilder()
        .setCustomId('subject')
        .setLabel('Subject')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Brief description of your issue')
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(100);

      const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Please describe your issue in detail...')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(1000);

      const row1 = new ActionRowBuilder().addComponents(subjectInput);
      const row2 = new ActionRowBuilder().addComponents(descriptionInput);

      modal.addComponents(row1, row2);
    }

    // Show modal - Discord requires response within 3 seconds
    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error handling category select:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `${emojis.error} An error occurred. Please try again.`,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (e) {
      // Ignore if we can't reply
    }
  }
}






export async function handleTicketModal(interaction) {
  try {
    const modalId = interaction.customId;
    const categoryName = modalId.replace('ticket_modal_', '');
    
    const guild = interaction.guild;
    const user = interaction.user;

    // Defer reply FIRST before any database operations
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Get category
    const category = await Category.findOne({
      guildId: guild.id,
      name: categoryName
    }).first();

    if (!category) {
      return interaction.editReply({
        content: `${emojis.error} Category not found.`
      });
    }

    // Get all field values from the modal
    const fieldValues = {};
    const modalFields = category?.modalFields || [];
    
    if (modalFields.length > 0) {
      // Custom modal - get values by field labels
      for (const field of modalFields) {
        const fieldId = field.label.toLowerCase().replace(/\s+/g, '_').substring(0, 20);
        try {
          fieldValues[field.label] = interaction.fields.getTextInputValue(fieldId);
        } catch (e) {
          console.error(`[TICKET MODAL] Could not get value for field: ${fieldId}`);
        }
      }
    } else {
      // Default modal - get subject and description
      try {
        fieldValues['Subject'] = interaction.fields.getTextInputValue('subject');
        fieldValues['Description'] = interaction.fields.getTextInputValue('description');
      } catch (e) {
        console.error('[TICKET MODAL] Could not get default field values');
      }
    }

    // Use first field as subject, rest as description for database
    const fieldEntries = Object.entries(fieldValues);
    const subject = fieldEntries[0]?.[1] || 'No subject';
    const description = fieldEntries.slice(1).map(([label, value]) => `**${label}:**\n${value}`).join('\n\n') || fieldEntries[0]?.[1] || 'No description';

    // Check user ticket limit

    const config = await Config.findOne({ guildId: guild.id });
    const maxTickets = config?.maxTicketsPerUser || 3;
    
    const userOpenTickets = await Ticket.countDocuments({
      guildId: guild.id,
      userId: user.id,
      status: { $in: ['open', 'in_progress', 'waiting'] }
    });

    if (userOpenTickets >= maxTickets) {
      return interaction.editReply({
        content: `${emojis.error} You have reached the maximum of ${maxTickets} open tickets. Please close an existing ticket first.`
      });
    }

    // Find or create ticket category channel
    let ticketParentId = config?.ticketCategoryId;
    
    if (category.categoryChannelId) {
      try {
        const catChannel = await guild.channels.fetch(category.categoryChannelId);
        if (catChannel) {
          ticketParentId = category.categoryChannelId;
        }
      } catch (e) {
        // Category channel not found
      }
    }

    // Save ticket to database FIRST to get the ticketNumber
    const createdTicket = await Ticket.create({
      channelId: 'temp', // Will update after channel creation
      guildId: guild.id,
      userId: user.id,
      username: user.username,
      category: categoryName,
      categoryId: category._id,
      subject: subject.substring(0, 100),
      description: description.substring(0, 2000),
      status: 'open',
      openedAt: new Date(),
      messageCount: 0,
      participants: [user.id]
    });

    
    // Get the ticket number from the created ticket
    const ticketNumber = createdTicket.ticketNumber;

    // Create ticket channel with category-based naming using the actual ticketNumber
    const channelName = `${categoryName.toLowerCase().replace(/\s+/g, '-')}-${ticketNumber}`;
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: ticketParentId,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
          deny: [
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });


    // Add staff permissions if category has specific staff roles
    if (category.staffRoleIds && category.staffRoleIds.length > 0) {
      for (const roleId of category.staffRoleIds) {
        try {
          await channel.permissionOverwrites.create(roleId, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            ReadMessageHistory: true,
            ManageMessages: true,
          });
        } catch (e) {
          // Role might not exist
        }
      }
    } else if (config?.staffRoleId) {
      // Global staff role
      try {
        await channel.permissionOverwrites.create(config.staffRoleId, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true,
          ReadMessageHistory: true,
          ManageMessages: true,
        });
      } catch (e) {
        // Role might not exist
      }
    }

    // Update the ticket with the actual channel ID
    await Ticket.updateOne(
      { _id: createdTicket._id },
      { $set: { channelId: channel.id } }
    );

    // Update category ticket count

    await Category.updateOne(
      { _id: category._id },
      { $inc: { ticketCount: 1 } }
    );

    // Build embed fields from all modal responses (wrapped in code blocks for readability)
    const embedFields = fieldEntries.map(([label, value]) => {
      const cleanValue = value.trim().substring(0, 1018);
      return {
        name: label,
        value: '```\n' + cleanValue + '\n```', // Wrap in code block using string concatenation
        inline: false
      };
    });



    // Build staff ping mentions
    let staffMentions = '';
    if (category.staffRoleIds && category.staffRoleIds.length > 0) {
      staffMentions = category.staffRoleIds.map(id => `<@&${id}>`).join(' ');
    } else if (config?.staffRoleId) {
      staffMentions = `<@&${config.staffRoleId}>`;
    }

    // Send welcome message to ticket channel
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`${emojis.ticket} Ticket #${ticketNumber}`)
      .setDescription(`**Category:** ${category.emoji} ${categoryName}\n**User:** ${user}`)
      .addFields(embedFields)
      .setColor(colors.primary)
      .setTimestamp();

    // Only staff buttons - creator cannot close/claim
    const closeButton = new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒');

    const claimButton = new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Claim')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✋');

    const addUserButton = new ButtonBuilder()
      .setCustomId('ticket_adduser')
      .setLabel('Add User')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('➕');

    const staffRow = new ActionRowBuilder().addComponents(closeButton, claimButton, addUserButton);


    // Send welcome message without buttons (creator can't use them)
    await channel.send({
      content: `${user}${staffMentions ? ' ' + staffMentions : ''}`,
      embeds: [welcomeEmbed]
    });

    // Send staff control buttons separately (staff only)
    await channel.send({
      content: `**Staff Controls:**`,
      components: [staffRow]
    });



    await interaction.editReply({
      content: `${emojis.success} Your ticket #${ticketNumber} has been created: ${channel}`
    });

  } catch (error) {
    console.error('Error creating ticket:', error);
    // Try to reply if not already replied
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${emojis.error} An error occurred while creating your ticket.`
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: `${emojis.error} An error occurred while creating your ticket.`,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (e) {
      console.error('Failed to send error response:', e);
    }
  }
}
