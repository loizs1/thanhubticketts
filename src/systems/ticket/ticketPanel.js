import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import Category from '../../database/models/Category.js';
import Config from '../../database/models/Config.js';
import colors from '../../config/colors.js';
import emojis from '../../config/emojis.js';

export async function createTicketPanel(guild, channel) {
  try {
    // Get config for panel customization
    const config = await Config.findOne({ guildId: guild.id });

    const categories = await Category.find({
      guildId: guild.id,
      isActive: true
    }).sort({ order: 1 });

    if (categories.length === 0) {
      return null;
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

    // Use custom panel settings or defaults
    const title = config?.panelTitle || `${emojis.ticket} Support Ticket System`;
    const description = config?.panelDescription || 'Select a category below to create a new support ticket.\n\nOur staff team will assist you as soon as possible!';
    const color = config?.panelColor || colors.primary;
    const thumbnail = config?.panelThumbnail || null;
    const image = config?.panelImage || null;
    const footer = config?.panelFooter || null;
    const placeholder = config?.panelPlaceholder || 'Select a category...';

    const embed = new EmbedBuilder()
      .setTitle(`✨ ${title}`)
      .setDescription(`${description}\n\n${emojis.info} **How to open a ticket?**\nClick the dropdown menu below and select the category that best fits your inquiry.`)
      .setColor(color)
      .setAuthor({
        name: `${guild.name} Support`,
        iconURL: guild.iconURL({ dynamic: true })
      });

    // Add optional fields if they exist
    if (thumbnail) embed.setThumbnail(thumbnail);
    else embed.setThumbnail(guild.iconURL({ dynamic: true }));

    if (image) embed.setImage(image);

    if (footer) {
      embed.setFooter({ text: footer, iconURL: guild.iconURL({ dynamic: true }) });
    } else {
      embed.setFooter({ text: 'Thanhub Ticket System • Premium Support', iconURL: guild.iconURL({ dynamic: true }) });
    }

    embed.setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('create_ticket')
          .setPlaceholder(`📂 ${placeholder}`)
          .addOptions(options)
      );

    const message = await channel.send({ embeds: [embed], components: [row] });
    return message;

  } catch (error) {
    console.error('Error creating ticket panel:', error);
    return null;
  }
}

export async function refreshTicketPanel(guild, config) {
  try {
    if (!config?.panelMessageId || !config?.createTicketChannelId) {
      return false;
    }

    const channel = await guild.channels.fetch(config.createTicketChannelId).catch(() => null);
    if (!channel) return false;

    const message = await channel.messages.fetch(config.panelMessageId).catch(() => null);
    if (!message) return false;

    const categories = await Category.find({
      guildId: guild.id,
      isActive: true
    }).sort({ order: 1 });

    if (categories.length === 0) {
      return false;
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

    // Use custom panel settings or defaults
    const title = config?.panelTitle || `${emojis.ticket} Support Ticket System`;
    const description = config?.panelDescription || 'Select a category below to create a new support ticket.\n\nOur staff team will assist you as soon as possible!';
    const color = config?.panelColor || colors.primary;
    const thumbnail = config?.panelThumbnail || null;
    const image = config?.panelImage || null;
    const footer = config?.panelFooter || null;
    const placeholder = config?.panelPlaceholder || 'Select a category...';

    const embed = new EmbedBuilder()
      .setTitle(`✨ ${title}`)
      .setDescription(`${description}\n\n${emojis.info} **How to open a ticket?**\nClick the dropdown menu below and select the category that best fits your inquiry.`)
      .setColor(color)
      .setAuthor({
        name: `${guild.name} Support`,
        iconURL: guild.iconURL({ dynamic: true })
      });

    // Add optional fields if they exist
    if (thumbnail) embed.setThumbnail(thumbnail);
    else embed.setThumbnail(guild.iconURL({ dynamic: true }));

    if (image) embed.setImage(image);

    if (footer) {
      embed.setFooter({ text: footer, iconURL: guild.iconURL({ dynamic: true }) });
    } else {
      embed.setFooter({ text: 'Thanhub Ticket System • Premium Support', iconURL: guild.iconURL({ dynamic: true }) });
    }

    embed.setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('create_ticket')
          .setPlaceholder(`📂 ${placeholder}`)
          .addOptions(options)
      );

    await message.edit({ embeds: [embed], components: [row] });
    return true;

  } catch (error) {
    console.error('Error refreshing ticket panel:', error);
    return false;
  }
}
