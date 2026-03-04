import chalk from 'chalk';
import { MessageFlags } from 'discord.js';
import { handleCategorySelect, handleTicketModal } from '../systems/ticket/ticketManager.js';
import { 
  handleCloseButton, 
  handleCloseModal, 
  handleReopenButton, 
  handleClaimButton, 
  handleTranscriptButton, 
  handleDeleteButton, 
  handleAddUserButton, 
  handleAddUserModal,
  handleDeleteWithTranscriptButton,
  handleDeleteTranscriptModal,
  handleDownloadHTMLButton,
  handleTranscriptDownloadButton
} from '../systems/ticket/ticketButtons.js';
import { generateLeaderboardEmbed } from '../commands/ticket/leaderboard.js';

export default {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        
        if (!command) {
          return interaction.reply({ 
            content: '❌ Command not found!', 
            flags: MessageFlags.Ephemeral
          });
        }
        
        await command.execute(interaction, client);
        console.log(chalk.gray(`/${interaction.commandName} by ${interaction.user.tag}`));
      }
      
      // Autocomplete
      else if (interaction.isAutocomplete()) {
        console.log(`[INTERACTION] Autocomplete triggered for: ${interaction.commandName}`);
        const command = client.commands.get(interaction.commandName);
        
        if (command && command.autocomplete) {
          console.log(`[INTERACTION] Found autocomplete handler for: ${interaction.commandName}`);
          await command.autocomplete(interaction);
        } else {
          console.log(`[INTERACTION] No autocomplete handler found for: ${interaction.commandName}`);
        }
      }
      
      // String Select Menus (Dropdowns)
      else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_category_select' || interaction.customId === 'create_ticket') {
          await handleCategorySelect(interaction);
        }
      }
      
      // Buttons
      else if (interaction.isButton()) {
        const customId = interaction.customId;
        
        // Leaderboard pagination buttons
        if (customId.startsWith('leaderboard_page_')) {
          const page = parseInt(customId.replace('leaderboard_page_', ''));
          const guild = interaction.guild;
          const userId = interaction.user.id;
          
          const result = await generateLeaderboardEmbed(guild, client, page, userId);
          
          if (result.content) {
            await interaction.update(result);
          } else {
            await interaction.update(result);
          }
          return;
        }
        
        if (customId === 'ticket_close') {
          await handleCloseButton(interaction);
        }
        else if (customId === 'ticket_reopen') {
          await handleReopenButton(interaction);
        }
        else if (customId === 'ticket_claim') {
          await handleClaimButton(interaction);
        }
        else if (customId === 'ticket_transcript') {
          await handleTranscriptButton(interaction);
        }
        else if (customId === 'ticket_delete') {
          await handleDeleteButton(interaction);
        }
        else if (customId === 'ticket_adduser') {
          await handleAddUserButton(interaction);
        }
        else if (customId === 'ticket_delete_with_transcript') {
          await handleDeleteWithTranscriptButton(interaction);
        }
        else if (customId.startsWith('ticket_download_html')) {
          await handleDownloadHTMLButton(interaction);
        }
        else if (customId.startsWith('transcript_download_')) {
          await handleTranscriptDownloadButton(interaction);
        }
      }
      
      // Modals
      else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('ticket_modal_')) {
          await handleTicketModal(interaction);
        }
        else if (interaction.customId === 'ticket_close_modal') {
          await handleCloseModal(interaction);
        }
        else if (interaction.customId === 'ticket_adduser_modal') {
          await handleAddUserModal(interaction);
        }
        else if (interaction.customId === 'ticket_delete_transcript_modal') {
          await handleDeleteTranscriptModal(interaction);
        }
      }
      
    } catch (error) {
      console.error(chalk.red('Interaction Error:'), error);
      
      // Check if it's an expired interaction error (code 10062 = Unknown interaction)
      if (error.code === 10062 || (error.rawError && error.rawError.code === 10062)) {
        console.log(chalk.yellow('Interaction expired - this is normal when users take too long'));
        return;
      }
      
      const errorMessage = { 
        content: '❌ An error occurred!', 
        flags: MessageFlags.Ephemeral
      };
      
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      } catch (e) {
        // Silently ignore if we can't reply (interaction expired or already acknowledged)
        if (e.code !== 10062 && e.code !== 40060) {
          console.error(chalk.red('Error sending error message:'), e);
        }
      }
    }
  }
};

