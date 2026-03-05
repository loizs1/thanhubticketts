import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } from 'discord.js';

import Category from '../../database/models/Category.js';
import Config from '../../database/models/Config.js';
import StaffPoints from '../../database/models/StaffPoints.js';
import { clearConfigCache } from '../../systems/ticket/ticketButtons.js';
import { refreshTicketPanel } from '../../systems/ticket/ticketPanel.js';
import colors from '../../config/colors.js';
import emojis from '../../config/emojis.js';


export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup and configure the ticket system')

    .addSubcommand(subcommand =>
      subcommand
        .setName('panel')
        .setDescription('Create the ticket creation panel'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('panelcustom')
        .setDescription('Customize the ticket panel appearance')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Custom title for the panel')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Custom description text')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('color')
            .setDescription('Embed color (hex like #FF0000)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('thumbnail')
            .setDescription('Thumbnail image URL')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('image')
            .setDescription('Large image URL')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('footer')
            .setDescription('Footer text')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('placeholder')
            .setDescription('Dropdown placeholder text')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('category')
        .setDescription('Manage ticket categories')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' },
              { name: 'List', value: 'list' },
              { name: 'Add Staff Role', value: 'addstaff' },
              { name: 'Remove Staff Role', value: 'removestaff' },
              { name: 'View Staff Roles', value: 'viewstaff' },
              { name: 'Set Modal Fields', value: 'setmodal' },
              { name: 'View Modal', value: 'viewmodal' }
            ))
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Category name')
            .setRequired(false)
            .setAutocomplete(true))

        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('Category emoji')
            .setRequired(false))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Discord category channel')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('staffrole')
            .setDescription('Staff role for this category')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('staffroleid')
            .setDescription('Staff role ID(s) - separate multiple with commas')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Custom description for this category (shown in dropdown)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('modalfields')
            .setDescription('JSON array of modal fields')
            .setRequired(false)))

    .addSubcommand(subcommand =>
      subcommand
        .setName('config')
        .setDescription('Configure ticket system settings')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(false)
            .addChoices(
              { name: 'List', value: 'list' },
              { name: 'Set', value: 'set' }
            ))
        .addRoleOption(option =>
          option.setName('staff')
            .setDescription('Global staff role (for all tickets)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('staffid')
            .setDescription('Global staff role ID (alternative to staff)')
            .setRequired(false))
        .addChannelOption(option =>
          option.setName('logs')
            .setDescription('Log channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .addChannelOption(option =>
          option.setName('transcripts')
            .setDescription('Transcript channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('maxtickets')
            .setDescription('Max tickets per user')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset and recreate the ticket panel'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('points')
        .setDescription('Configure the point system')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(false)
            .addChoices(
              { name: 'List', value: 'list' },
              { name: 'Set', value: 'set' },
              { name: 'Reset', value: 'reset' }
            ))
        .addBooleanOption(option =>
          option.setName('enable')
            .setDescription('Enable or disable points')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('points')
            .setDescription('Points to award per closed ticket')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false))),

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'category') {
      const focusedOption = interaction.options.getFocused(true);

      if (focusedOption.name === 'name') {
        const guildId = interaction.guild.id;
        const focusedValue = focusedOption.value;

        console.log(`[AUTOCOMPLETE] Guild: ${guildId}, Filter: "${focusedValue}"`);

        try {
          // Get all categories for this guild
          const categories = await Category.find({
            guildId: guildId
          }).sort({ order: 1 }).exec();

          console.log(`[AUTOCOMPLETE] Found ${categories.length} total categories`);

          // Filter categories based on input
          const filteredCategories = categories.filter(cat => {
            const match = cat.name.toLowerCase().includes(focusedValue.toLowerCase());
            console.log(`[AUTOCOMPLETE] Checking "${cat.name}" - match: ${match}`);
            return match;
          });

          console.log(`[AUTOCOMPLETE] Filtered to ${filteredCategories.length} categories`);

          // Map to choices format
          const choices = filteredCategories
            .slice(0, 25)
            .map(cat => ({
              name: `${cat.isActive ? '🟢' : '🔴'} ${cat.emoji || '🎟️'} ${cat.name}`.slice(0, 100),
              value: cat.name.slice(0, 100)
            }));

          console.log(`[AUTOCOMPLETE] Responding with ${choices.length} choices:`, choices);

          // Always respond, even if empty
          await interaction.respond(choices);

        } catch (error) {
          console.error('[AUTOCOMPLETE] Error:', error);
          try {
            await interaction.respond([]);
          } catch (respondError) {
            console.error('[AUTOCOMPLETE] Failed to respond:', respondError);
          }
        }
      } else {
        await interaction.respond([]);
      }
    } else {
      await interaction.respond([]);
    }
  },


  async execute(interaction) {
    const member = interaction.member;
    const config = await Config.findOne({ guildId: interaction.guild.id });

    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    const hasAdminRole = config?.staffRoleId && member.roles.cache.has(config.staffRoleId);

    if (!isAdmin && !hasAdminRole) {
      return interaction.reply({
        content: `${emojis.error} You need Administrator permission or the configured Admin role to use this command.`,
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'panel':
        await handlePanel(interaction);
        break;
      case 'panelcustom':
        await handlePanelCustom(interaction);
        break;
      case 'category':
        await handleCategory(interaction);
        break;
      case 'config':
        await handleConfig(interaction);
        break;
      case 'reset':
        await handleReset(interaction);
        break;
      case 'points':
        await handlePoints(interaction);
        break;
    }
  }
};

async function handlePanel(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const categories = await Category.find({
      guildId: interaction.guild.id,
      isActive: true
    }).sort({ order: 1 }).exec();

    if (categories.length === 0) {
      return interaction.editReply({
        content: `${emojis.error} No ticket categories found. Please create categories first using \`/setup category\``
      });
    }

    const options = categories.map(cat => {
      const option = {
        label: cat.name,
        description: cat.description || `Create a ${cat.name} ticket`,
        value: cat.name
      };
      if (cat.emoji && typeof cat.emoji === 'string' && cat.emoji.trim().length > 0) {
        option.emoji = cat.emoji.trim();
      }
      return option;
    });

    const config = await Config.findOne({ guildId: interaction.guild.id });

    const title = config?.panelTitle || `${emojis.ticket} Support Ticket System`;
    const description = config?.panelDescription || 'Select a category below to create a new support ticket.\n\nOur staff team will assist you as soon as possible!';
    const color = config?.panelColor || colors.primary;
    const placeholder = config?.panelPlaceholder || 'Select a category...';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (config?.panelThumbnail) embed.setThumbnail(config.panelThumbnail);
    if (config?.panelImage) embed.setImage(config.panelImage);
    if (config?.panelFooter) embed.setFooter({ text: config.panelFooter });

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('create_ticket')
          .setPlaceholder(placeholder)
          .addOptions(options)
      );

    const channel = interaction.channel;
    const message = await channel.send({ embeds: [embed], components: [row] });

    await Config.findOneAndUpsert(
      { guildId: interaction.guild.id },
      {
        $set: {
          panelMessageId: message.id,
          createTicketChannelId: channel.id
        }
      }
    );

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${emojis.success} Global Panel Created`)
          .setDescription(`The ticket creation panel has been deployed to <#${channel.id}>.\n\n**Quick Tips:**\n• Use \`/setup panelcustom\` to change the appearance.\n• Use \`/setup category\` to manage ticket types.`)
          .setColor(colors.success)
          .setTimestamp()
      ]
    });

  } catch (error) {
    console.error('Error creating panel:', error);
    await interaction.editReply({
      content: `${emojis.error} An error occurred while creating the panel.`
    });
  }
}

async function handlePanelCustom(interaction) {
  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const color = interaction.options.getString('color');
  const thumbnail = interaction.options.getString('thumbnail');
  const image = interaction.options.getString('image');
  const footer = interaction.options.getString('footer');
  const placeholder = interaction.options.getString('placeholder');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // If no options provided, show current settings
    if (!title && !description && !color && !thumbnail && !image && !footer && !placeholder) {
      const config = await Config.findOne({ guildId: interaction.guild.id });

      const embed = new EmbedBuilder()
        .setTitle('🎨 Panel Customization Settings')
        .setDescription('Current panel customization (leave empty to keep current):')
        .addFields(
          { name: '📝 Title', value: config?.panelTitle || 'Support Ticket System', inline: true },
          { name: '📄 Description', value: config?.panelDescription ? config.panelDescription.substring(0, 50) + '...' : 'Default', inline: true },
          { name: '🎨 Color', value: config?.panelColor || '#5865F2', inline: true },
          { name: '🖼️ Thumbnail', value: config?.panelThumbnail || 'None', inline: true },
          { name: '🖼️ Image', value: config?.panelImage || 'None', inline: true },
          { name: '📎 Footer', value: config?.panelFooter || 'None', inline: true },
          { name: '📋 Placeholder', value: config?.panelPlaceholder || 'Select a category...', inline: true }
        )
        .setColor(colors.primary)
        .setFooter({ text: 'Use /setup panelcustom with options to customize' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    const updates = {};

    if (title) updates.panelTitle = title;
    if (description) updates.panelDescription = description;
    if (color) updates.panelColor = color;
    if (thumbnail) updates.panelThumbnail = thumbnail;
    if (image) updates.panelImage = image;
    if (footer) updates.panelFooter = footer;
    if (placeholder) updates.panelPlaceholder = placeholder;

    if (Object.keys(updates).length === 0) {
      return interaction.editReply({
        content: `${emojis.info} No changes specified. Use options to customize the panel.`
      });
    }

    console.log(`[PANEL CUSTOM] Saving customizations for guild ${interaction.guild.id}:`, updates);

    await Config.findOneAndUpsert(
      { guildId: interaction.guild.id },
      { $set: updates }
    );

    // Refresh the panel to show changes
    await refreshTicketPanel(interaction.guild, await Config.findOne({ guildId: interaction.guild.id }));

    const changes = [];
    if (title) changes.push(`📝 Title: ${title}`);
    if (description) changes.push(`📄 Description: ${description.substring(0, 30)}...`);
    if (color) changes.push(`🎨 Color: ${color}`);
    if (thumbnail) changes.push(`🖼️ Thumbnail: Set`);
    if (image) changes.push(`🖼️ Image: Set`);
    if (footer) changes.push(`📎 Footer: ${footer}`);
    if (placeholder) changes.push(`📋 Placeholder: ${placeholder}`);

    const embed = new EmbedBuilder()
      .setTitle(`${emojis.success} Style Updated`)
      .setDescription(`The panel appearance has been refreshed with your new settings!\n\n**Changes Applied:**\n${changes.map(c => `• ${c}`).join('\n')}`)
      .setColor(colors.success)
      .setAuthor({ name: 'System Appearance' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error customizing panel:', error);
    await interaction.editReply({
      content: `${emojis.error} An error occurred while customizing the panel.`
    });
  }
}

async function handleCategory(interaction) {
  const action = interaction.options.getString('action');
  const name = interaction.options.getString('name');
  const emoji = interaction.options.getString('emoji') || '🎟️';
  const description = interaction.options.getString('description');
  const channel = interaction.options.getChannel('channel');
  const staffRole = interaction.options.getRole('staffrole');
  const staffRoleId = interaction.options.getString('staffroleid');


  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    switch (action) {
      case 'add': {
        const currentCategories = await Category.find({
          guildId: interaction.guild.id
        }).sort({ order: 1 }).exec();

        if (!name) {
          let categoryList = currentCategories.length > 0
            ? currentCategories.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n')
            : 'No categories yet.';

          return interaction.editReply({
            content: `${emojis.info} Please specify a category name to add.\n\n**Current categories:**\n${categoryList}\n\nUsage: \`/setup category action:add name:CATEGORY_NAME emoji:🎫\``
          });
        }

        const existing = await Category.findOne({
          guildId: interaction.guild.id,
          name: name
        }).first();

        if (existing) {
          if (!existing.isActive) {
            await Category.updateOne(
              { guildId: interaction.guild.id, name },
              { $set: { isActive: true } }
            );

            const refreshResult = await refreshTicketPanel(interaction.guild, await Config.findOne({ guildId: interaction.guild.id }));
            let msg = `${emojis.success} Category "${name}" ${existing.emoji} reactivated successfully!`;
            if (refreshResult) {
              msg += `\n${emojis.success} Panel auto-refreshed with reactivated category.`;
            }

            return interaction.editReply({ content: msg });
          }

          const activeCategories = currentCategories.filter(cat => cat.isActive);
          const categoryList = activeCategories.length > 0
            ? activeCategories.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n')
            : 'No active categories.';

          return interaction.editReply({
            content: `${emojis.error} Category "${name}" already exists and is active.\n\n**Current active categories:**\n${categoryList}`
          });
        }

        let staffRoleIds = [];
        if (staffRole) {
          staffRoleIds = [staffRole.id];
        } else if (staffRoleId) {
          const roleIds = staffRoleId.split(',').map(id => id.trim()).filter(id => id);
          for (const roleId of roleIds) {
            try {
              const role = await interaction.guild.roles.fetch(roleId);
              if (role) {
                staffRoleIds.push(roleId);
              }
            } catch (e) {
              // Role might not exist
            }
          }
        }

        await Category.create({
          guildId: interaction.guild.id,
          name,
          emoji,
          description: description || `Support for ${name}`,
          categoryChannelId: channel?.id,
          staffRoleIds: staffRoleIds,
          isActive: true
        });


        const staffInfo = staffRoleIds.length > 0 ? ` (Staff: ${staffRoleIds.map(id => `<@&${id}>`).join(', ')})` : '';
        const refreshResult = await refreshTicketPanel(interaction.guild, await Config.findOne({ guildId: interaction.guild.id }));

        let msg = `${emojis.success} Category "${name}" ${emoji} created successfully!${staffInfo}`;
        if (refreshResult) {
          msg += `\n${emojis.success} Panel auto-refreshed with new category.`;
        }

        await interaction.editReply({ content: msg });
        break;
      }

      case 'remove': {
        const allCategories = await Category.find({
          guildId: interaction.guild.id
        }).sort({ order: 1 }).exec();

        if (allCategories.length === 0) {
          return interaction.editReply({
            content: `${emojis.error} No categories exist. Use \`/setup category action:add\` to create one.`
          });
        }

        if (!name) {
          const categoryList = allCategories.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
          return interaction.editReply({
            content: `${emojis.info} Please specify a category name to remove.\n\n**Available categories:**\n${categoryList}\n\nUsage: \`/setup category action:remove name:CATEGORY_NAME\``
          });
        }

        const deleted = await Category.findOneAndDelete({
          guildId: interaction.guild.id,
          name
        });

        if (!deleted) {
          const categoryList = allCategories.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
          return interaction.editReply({
            content: `${emojis.error} Category "${name}" not found.\n\n**Available categories:**\n${categoryList}`
          });
        }

        const refreshResult = await refreshTicketPanel(interaction.guild, await Config.findOne({ guildId: interaction.guild.id }));
        let msg = `${emojis.success} Category "${name}" removed successfully!`;
        if (refreshResult) {
          msg += `\n${emojis.success} Panel auto-refreshed.`;
        }

        await interaction.editReply({ content: msg });
        break;
      }

      case 'list': {
        const categories = await Category.find({
          guildId: interaction.guild.id
        }).sort({ order: 1 }).exec();

        if (categories.length === 0) {
          return interaction.editReply({
            content: `${emojis.info} No categories found.`
          });
        }

        const list = categories.map(cat => {
          const staffInfo = cat.staffRoleIds?.length > 0
            ? ` (Staff: ${cat.staffRoleIds.map(id => `<@&${id}>`).join(', ')})`
            : '';
          return `${cat.isActive ? '🟢' : '🔴'} ${cat.emoji} **${cat.name}** - ${cat.ticketCount} tickets${staffInfo}`;
        }).join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`${emojis.ticket} Ticket Categories`)
          .setDescription(list)
          .setColor(colors.primary)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case 'addstaff': {
        const allCats = await Category.find({
          guildId: interaction.guild.id
        }).sort({ order: 1 }).exec();

        if (allCats.length === 0) {
          return interaction.editReply({
            content: `${emojis.error} No categories exist. Use \`/setup category action:add\` to create one first.`
          });
        }

        if (!name) {
          const categoryList = allCats.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
          return interaction.editReply({
            content: `${emojis.info} Please specify a category name and staff role to add.\n\n**Available categories:**\n${categoryList}\n\nUsage: \`/setup category action:addstaff name:CATEGORY_NAME staffrole:@Role\``
          });
        }

        let newStaffRoleIds = [];

        if (staffRole) {
          newStaffRoleIds.push(staffRole.id);
        }

        if (staffRoleId) {
          const roleIds = staffRoleId.split(',').map(id => id.trim()).filter(id => id);

          for (const roleId of roleIds) {
            try {
              const role = await interaction.guild.roles.fetch(roleId);
              if (role) {
                newStaffRoleIds.push(roleId);
              } else {
                return interaction.editReply({
                  content: `${emojis.error} Role with ID ${roleId} not found.`
                });
              }
            } catch (e) {
              return interaction.editReply({
                content: `${emojis.error} Invalid staff role ID: ${roleId}`
              });
            }
          }
        }

        if (newStaffRoleIds.length === 0) {
          return interaction.editReply({
            content: `${emojis.error} Please provide a staff role or staff role ID(s).`
          });
        }

        const category = await Category.findOne({
          guildId: interaction.guild.id,
          name
        }).first();

        if (!category) {
          const categoryList = allCats.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
          return interaction.editReply({
            content: `${emojis.error} Category "${name}" not found.\n\n**Available categories:**\n${categoryList}`
          });
        }

        const currentRoles = category.staffRoleIds || [];
        const duplicateRoles = newStaffRoleIds.filter(id => currentRoles.includes(id));
        const rolesToAdd = newStaffRoleIds.filter(id => !currentRoles.includes(id));

        if (rolesToAdd.length === 0) {
          return interaction.editReply({
            content: `${emojis.error} All provided roles are already staff roles for "${name}".\nCurrent staff: ${currentRoles.map(id => `<@&${id}>`).join(', ') || 'None'}`
          });
        }

        const updatedRoles = [...currentRoles, ...rolesToAdd];

        await Category.updateOne(
          { guildId: interaction.guild.id, name },
          { $set: { staffRoleIds: updatedRoles } }
        );

        const refreshResult = await refreshTicketPanel(interaction.guild, await Config.findOne({ guildId: interaction.guild.id }));
        const addedRolesList = rolesToAdd.map(id => `<@&${id}>`).join(', ');
        let msg = `${emojis.success} Added ${addedRolesList} as staff for "${name}".`;
        if (duplicateRoles.length > 0) {
          msg += `\n${emojis.info} Skipped ${duplicateRoles.map(id => `<@&${id}>`).join(', ')} (already exists).`;
        }
        msg += `\nCurrent staff: ${updatedRoles.map(id => `<@&${id}>`).join(', ')}`;
        if (refreshResult) {
          msg += `\n${emojis.success} Panel auto-refreshed.`;
        }

        await interaction.editReply({ content: msg });
        break;
      }

      case 'removestaff': {
        const allCats = await Category.find({
          guildId: interaction.guild.id
        }).sort({ order: 1 }).exec();

        if (allCats.length === 0) {
          return interaction.editReply({
            content: `${emojis.error} No categories exist. Use \`/setup category action:add\` to create one first.`
          });
        }

        if (!name) {
          const categoryList = allCats.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
          return interaction.editReply({
            content: `${emojis.info} Please specify a category name and staff role to remove.\n\n**Available categories:**\n${categoryList}\n\nUsage: \`/setup category action:removestaff name:CATEGORY_NAME staffrole:@Role\``
          });
        }

        let removeStaffRoleId = null;
        if (staffRole) {
          removeStaffRoleId = staffRole.id;
        } else if (staffRoleId) {
          try {
            const role = await interaction.guild.roles.fetch(staffRoleId);
            if (role) {
              removeStaffRoleId = staffRoleId;
            } else {
              return interaction.editReply({
                content: `${emojis.error} Role with ID ${staffRoleId} not found.`
              });
            }
          } catch (e) {
            return interaction.editReply({
              content: `${emojis.error} Invalid staff role ID: ${staffRoleId}`
            });
          }
        } else {
          return interaction.editReply({
            content: `${emojis.error} Please provide a staff role or staff role ID.`
          });
        }

        const category = await Category.findOne({
          guildId: interaction.guild.id,
          name
        }).first();

        if (!category) {
          const categoryList = allCats.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
          return interaction.editReply({
            content: `${emojis.error} Category "${name}" not found.\n\n**Available categories:**\n${categoryList}`
          });
        }

        const currentRoles = category.staffRoleIds || [];
        if (!currentRoles.includes(removeStaffRoleId)) {
          return interaction.editReply({
            content: `${emojis.error} Role <@&${removeStaffRoleId}> is not a staff role for "${name}".\nCurrent staff: ${currentRoles.map(id => `<@&${id}>`).join(', ') || 'None'}`
          });
        }

        const updatedRoles = currentRoles.filter(id => id !== removeStaffRoleId);

        await Category.updateOne(
          { guildId: interaction.guild.id, name },
          { $set: { staffRoleIds: updatedRoles } }
        );

        const refreshResult = await refreshTicketPanel(interaction.guild, await Config.findOne({ guildId: interaction.guild.id }));
        let msg = `${emojis.success} Removed <@&${removeStaffRoleId}> from staff for "${name}".\nRemaining staff: ${updatedRoles.map(id => `<@&${id}>`).join(', ') || 'None'}`;
        if (refreshResult) {
          msg += `\n${emojis.success} Panel auto-refreshed.`;
        }

        await interaction.editReply({ content: msg });
        break;
      }

      case 'viewstaff': {
        const allCats = await Category.find({
          guildId: interaction.guild.id
        }).sort({ order: 1 }).exec();

        if (allCats.length === 0) {
          return interaction.editReply({
            content: `${emojis.info} No categories found.`
          });
        }

        if (name) {
          const category = await Category.findOne({
            guildId: interaction.guild.id,
            name
          }).first();

          if (!category) {
            const categoryList = allCats.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
            return interaction.editReply({
              content: `${emojis.error} Category "${name}" not found.\n\n**Available categories:**\n${categoryList}`
            });
          }

          const staffRoles = category.staffRoleIds || [];
          const staffList = staffRoles.length > 0
            ? staffRoles.map(id => `• <@&${id}>`).join('\n')
            : 'No staff roles assigned.';

          const embed = new EmbedBuilder()
            .setTitle(`${category.emoji} ${category.name} - Staff Roles`)
            .setDescription(staffList)
            .setColor(colors.primary)
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle(`📂 Ticket Categories`)
          .setDescription(`Found **${allCats.length}** categories configured for this server.`)
          .setColor(colors.primary)
          .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
          .setTimestamp();

        for (const cat of allCats) {
          const staffCount = (cat.staffRoleIds || []).length;
          const status = cat.isActive ? '✅ Active' : '❌ Disabled';
          embed.addFields({
            name: `${cat.emoji} ${cat.name}`,
            value: `> ${status}\n> 🛡️ Staff: **${staffCount}** roles\n> 📋 Count: **${cat.ticketCount}** tickets`,
            inline: true
          });
        }

        return interaction.editReply({ embeds: [embed] });
        break;
      }

      case 'setmodal': {
        const allCats = await Category.find({
          guildId: interaction.guild.id
        }).sort({ order: 1 }).exec();

        if (allCats.length === 0) {
          return interaction.editReply({
            content: `${emojis.error} No categories exist. Use \`/setup category action:add\` to create one first.`
          });
        }

        if (!name) {
          const categoryList = allCats.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
          return interaction.editReply({
            content: `${emojis.info} Please specify a category name and modal fields JSON.\n\n**Available categories:**\n${categoryList}\n\n**Example:**\n\`/setup category action:setmodal name:Support modalfields:[{"label":"Subject","placeholder":"Brief description","required":true,"style":"short"},{"label":"Details","placeholder":"Detailed description","required":true,"style":"paragraph"}]\``
          });
        }

        const category = await Category.findOne({
          guildId: interaction.guild.id,
          name
        }).first();

        if (!category) {
          const categoryList = allCats.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
          return interaction.editReply({
            content: `${emojis.error} Category "${name}" not found.\n\n**Available categories:**\n${categoryList}`
          });
        }

        const modalFieldsJson = interaction.options.getString('modalfields');
        if (!modalFieldsJson) {
          return interaction.editReply({
            content: `${emojis.error} Please provide modal fields JSON.\n\n**Example:**\n\`[{"label":"Subject","placeholder":"Brief description","required":true,"style":"short"},{"label":"Details","placeholder":"Detailed description","required":true,"style":"paragraph"}]\``
          });
        }

        let modalFields;
        try {
          modalFields = JSON.parse(modalFieldsJson);
          if (!Array.isArray(modalFields)) {
            throw new Error('Modal fields must be an array');
          }
          if (modalFields.length === 0 || modalFields.length > 5) {
            throw new Error('You must have 1-5 modal fields');
          }
          for (const field of modalFields) {
            if (!field.label) throw new Error('Each field must have a label');
            if (field.style && !['short', 'paragraph'].includes(field.style)) {
              throw new Error('Style must be "short" or "paragraph"');
            }
          }
        } catch (e) {
          return interaction.editReply({
            content: `${emojis.error} Invalid JSON: ${e.message}\n\n**Example:**\n\`[{"label":"Subject","placeholder":"Brief description","required":true,"style":"short"},{"label":"Details","placeholder":"Detailed description","required":true,"style":"paragraph"}]\``
          });
        }

        await Category.updateOne(
          { guildId: interaction.guild.id, name },
          { $set: { modalFields } }
        );

        const fieldsList = modalFields.map((f, i) => `${i + 1}. **${f.label}** (${f.style || 'short'})${f.required ? ' *required*' : ''}`).join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`${emojis.success} Modal Updated`)
          .setDescription(`Custom modal set for **${name}** category:\n\n${fieldsList}`)
          .setColor(colors.success)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case 'viewmodal': {
        const allCats = await Category.find({
          guildId: interaction.guild.id
        }).sort({ order: 1 }).exec();

        if (allCats.length === 0) {
          return interaction.editReply({
            content: `${emojis.info} No categories found.`
          });
        }

        if (name) {
          const category = await Category.findOne({
            guildId: interaction.guild.id,
            name
          }).first();

          if (!category) {
            const categoryList = allCats.map(cat => `• ${cat.emoji} **${cat.name}**`).join('\n');
            return interaction.editReply({
              content: `${emojis.error} Category "${name}" not found.\n\n**Available categories:**\n${categoryList}`
            });
          }

          const modalFields = category.modalFields || [];
          if (modalFields.length === 0) {
            return interaction.editReply({
              content: `${emojis.info} **${category.name}** uses the default modal (Subject + Description).\n\nTo customize, use:\n\`/setup category action:setmodal name:${category.name} modalfields:YOUR_JSON\``
            });
          }

          const fieldsList = modalFields.map((f, i) =>
            `${i + 1}. **${f.label}**\n` +
            `   • Style: ${f.style || 'short'}\n` +
            `   • Required: ${f.required ? 'Yes' : 'No'}\n` +
            `   • Placeholder: ${f.placeholder || 'None'}\n` +
            `   • Min/Max: ${f.minLength || 0}/${f.maxLength || 4000}`
          ).join('\n\n');

          const embed = new EmbedBuilder()
            .setTitle(`${category.emoji} ${category.name} - Custom Modal`)
            .setDescription(fieldsList)
            .setColor(colors.primary)
            .setFooter({ text: 'Use /setup category action:setmodal to change' })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle(`${emojis.ticket} Category Modal Configuration`)
          .setColor(colors.primary)
          .setTimestamp();

        for (const cat of allCats) {
          const modalFields = cat.modalFields || [];
          const modalStatus = modalFields.length > 0
            ? `✅ Custom (${modalFields.length} fields)`
            : '⚪ Default (Subject + Description)';

          embed.addFields({
            name: `${cat.emoji} ${cat.name}`,
            value: modalStatus,
            inline: false
          });
        }

        embed.setFooter({ text: 'Use /setup category action:viewmodal name:CATEGORY for details' });

        await interaction.editReply({ embeds: [embed] });
        break;
      }
    }

  } catch (error) {
    console.error('Error managing category:', error);
    await interaction.editReply({
      content: `${emojis.error} An error occurred while managing categories.`
    });
  }
}

async function handleReset(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const config = await Config.findOne({ guildId: interaction.guild.id });

    if (!config?.panelMessageId) {
      return interaction.editReply({
        content: `${emojis.error} No panel found to reset. Use \`/setup panel\` to create a new one.`
      });
    }

    try {
      const channel = interaction.channel;
      const oldMessage = await channel.messages.fetch(config.panelMessageId);
      if (oldMessage) {
        await oldMessage.delete();
      }
    } catch (e) {
      // Message might already be deleted
    }

    await Config.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { $set: { panelMessageId: null } }
    );

    await interaction.editReply({
      content: `${emojis.success} Old panel cleared. Creating new panel...`
    });

    const categories = await Category.find({
      guildId: interaction.guild.id,
      isActive: true
    }).sort({ order: 1 }).exec();

    if (categories.length === 0) {
      return interaction.editReply({
        content: `${emojis.error} No ticket categories found. Please create categories first using \`/setup category\``
      });
    }

    const options = categories.map(cat => {
      const option = {
        label: cat.name,
        description: cat.description || `Create a ${cat.name} ticket`,
        value: cat.name
      };
      if (cat.emoji && typeof cat.emoji === 'string' && cat.emoji.trim().length > 0) {
        option.emoji = cat.emoji.trim();
      }
      return option;
    });

    const newConfig = await Config.findOne({ guildId: interaction.guild.id });

    const title = newConfig?.panelTitle || `${emojis.ticket} Support Ticket System`;
    const description = newConfig?.panelDescription || 'Select a category below to create a new support ticket.\n\nOur staff team will assist you as soon as possible!';
    const color = newConfig?.panelColor || colors.primary;
    const placeholder = newConfig?.panelPlaceholder || 'Select a category...';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (newConfig?.panelThumbnail) embed.setThumbnail(newConfig.panelThumbnail);
    if (newConfig?.panelImage) embed.setImage(newConfig.panelImage);
    if (newConfig?.panelFooter) embed.setFooter({ text: newConfig.panelFooter });

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('create_ticket')
          .setPlaceholder(placeholder)
          .addOptions(options)
      );

    const channel = interaction.channel;
    const message = await channel.send({ embeds: [embed], components: [row] });

    await Config.findOneAndUpdate(
      { guildId: interaction.guild.id },
      {
        $set: {
          panelMessageId: message.id,
          createTicketChannelId: channel.id
        }
      }
    );

    await interaction.editReply({
      content: `${emojis.success} Panel reset successfully! New panel created with your customizations.`
    });

  } catch (error) {
    console.error('Error resetting panel:', error);
    await interaction.editReply({
      content: `${emojis.error} An error occurred while resetting the panel.`
    });
  }
}

async function handlePoints(interaction) {
  const action = interaction.options.getString('action') || 'list';
  const enablePoints = interaction.options.getBoolean('enable');
  const pointsOnClose = interaction.options.getInteger('points');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (action === 'list' || (enablePoints === null && !pointsOnClose)) {
      const config = await Config.findOne({ guildId: interaction.guild.id });

      if (!config) {
        const embed = new EmbedBuilder()
          .setTitle(`${emojis.trophy} Point System Configuration`)
          .setDescription('No configuration found. Use `/setup points action:set` to configure.')
          .setColor(colors.warning)
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setTitle(`${emojis.trophy} Point System Configuration`)
        .setDescription('Current point settings for this server:')
        .addFields(
          { name: '🎯 Points Enabled', value: config.pointsEnabled !== false ? '✅ Yes' : '❌ No', inline: true },
          { name: '🏆 Points Per Close', value: (config.pointsOnClose || 1).toString(), inline: true }
        )
        .setColor(colors.primary)
        .setFooter({ text: 'Use /setup points action:set to change settings' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (action === 'set') {
      const updates = {};

      if (enablePoints !== null) {
        updates.pointsEnabled = enablePoints ? 1 : 0;
      }
      if (pointsOnClose !== null) {
        updates.pointsOnClose = pointsOnClose;
      }

      if (Object.keys(updates).length === 0) {
        return interaction.editReply({
          content: `${emojis.info} No changes specified. Use options to set configuration values.`
        });
      }

      console.log(`[POINTS CONFIG] Saving config for guild ${interaction.guild.id}:`, updates);

      await Config.findOneAndUpsert(
        { guildId: interaction.guild.id },
        { $set: updates }
      );

      console.log(`[POINTS CONFIG] Config saved successfully.`);

      clearConfigCache(interaction.guild.id);

      const changes = [];
      if (enablePoints !== null) changes.push(`🎯 Points: ${enablePoints ? '✅ Enabled' : '❌ Disabled'}`);
      if (pointsOnClose !== null) changes.push(`🏆 Points per close: ${pointsOnClose}`);

      const embed = new EmbedBuilder()
        .setTitle(`${emojis.success} Point System Updated`)
        .setDescription(changes.join('\n'))
        .setColor(colors.success)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    if (action === 'reset') {
      await StaffPoints.resetPoints(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle(`${emojis.success} Points Reset`)
        .setDescription('All staff points have been reset to 0!')
        .setColor(colors.success)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (error) {
    console.error('Error updating points config:', error);
    await interaction.editReply({
      content: `${emojis.error} An error occurred while updating point configuration.`
    });
  }
}

async function handleConfig(interaction) {
  const action = interaction.options.getString('action') || 'list';
  const staffRole = interaction.options.getRole('staff');
  const staffRoleId = interaction.options.getString('staffid');
  const logChannel = interaction.options.getChannel('logs');
  const transcriptChannel = interaction.options.getChannel('transcripts');
  const maxTickets = interaction.options.getInteger('maxtickets');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (action === 'list' || (!staffRole && !staffRoleId && !logChannel && !transcriptChannel && !maxTickets)) {
      const config = await Config.findOne({ guildId: interaction.guild.id });

      if (!config) {
        const embed = new EmbedBuilder()
          .setTitle(`${emojis.ticket} Ticket System Configuration`)
          .setDescription('No configuration found. Use `/setup config action:set` to configure.')
          .setColor(colors.warning)
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setTitle(`⚙️ Server Configuration`)
        .setDescription('Current settings for this server:')
        .addFields(
          { name: '�️ Staff Role', value: config.staffRoleId ? `<@&${config.staffRoleId}>` : '❌ Not set', inline: true },
          { name: '📋 Logs', value: config.ticketLogChannelId ? `<#${config.ticketLogChannelId}>` : '❌ Not set', inline: true },
          { name: '� Transcripts', value: config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : '❌ Not set', inline: true },
          { name: '🔢 Max Tickets', value: `\`${config.maxTicketsPerUser || '3'}\``, inline: true },
          { name: '✨ Points', value: config.pointsEnabled !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: '� Auto-Close', value: config.autoCloseEnabled ? `✅ ${config.autoCloseDays}d` : '❌ Off', inline: true }
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setColor(colors.primary)
        .setFooter({ text: 'Use /setup config action:set to change settings' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (action === 'set') {
      const updates = {};

      if (staffRole) {
        updates.staffRoleId = staffRole.id;
      } else if (staffRoleId) {
        try {
          const role = await interaction.guild.roles.fetch(staffRoleId);
          if (role) {
            updates.staffRoleId = staffRoleId;
          } else {
            return interaction.editReply({
              content: `${emojis.error} Role with ID ${staffRoleId} not found.`
            });
          }
        } catch (e) {
          return interaction.editReply({
            content: `${emojis.error} Invalid staff role ID: ${staffRoleId}`
          });
        }
      }

      if (logChannel) updates.ticketLogChannelId = logChannel.id;
      if (transcriptChannel) {
        updates.transcriptChannelId = transcriptChannel.id;
        console.log(`[CONFIG] Setting transcript channel to: ${transcriptChannel.id} (${transcriptChannel.name})`);
      }
      if (maxTickets) updates.maxTicketsPerUser = maxTickets;

      if (Object.keys(updates).length === 0) {
        return interaction.editReply({
          content: `${emojis.info} No changes specified. Use options to set configuration values.`
        });
      }

      console.log(`[CONFIG] Saving config for guild ${interaction.guild.id}:`, updates);

      await Config.findOneAndUpsert(
        { guildId: interaction.guild.id },
        { $set: updates }
      );

      console.log(`[CONFIG] Config saved successfully.`);

      clearConfigCache(interaction.guild.id);

      const changes = [];
      if (updates.staffRoleId) changes.push(`👤 Staff Role: <@&${updates.staffRoleId}>`);
      if (updates.ticketLogChannelId) changes.push(`📋 Log Channel: <#${updates.ticketLogChannelId}>`);
      if (updates.transcriptChannelId) changes.push(`📄 Transcript Channel: <#${updates.transcriptChannelId}>`);
      if (updates.maxTicketsPerUser) changes.push(`🔢 Max Tickets: ${updates.maxTicketsPerUser}`);

      const embed = new EmbedBuilder()
        .setTitle(`${emojis.success} Configuration Updated`)
        .setDescription(changes.join('\n'))
        .setColor(colors.success)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (error) {
    console.error('Error updating config:', error);
    await interaction.editReply({
      content: `${emojis.error} An error occurred while updating configuration.`
    });
  }
}
