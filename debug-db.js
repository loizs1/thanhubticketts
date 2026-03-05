import { connectDatabase, getDb } from './src/database/database.js';
import Config from './src/database/models/Config.js';
import Ticket from './src/database/models/Ticket.js';

async function debug() {
    await connectDatabase();

    console.log('--- Configs ---');
    const configs = await Config.find({});
    console.log('Total configs:', configs.length);
    configs.forEach(c => {
        console.log(`Guild: ${c.guildId}, PanelMessageId: ${c.panelMessageId}, ChannelId: ${c.createTicketChannelId}`);
    });

    console.log('\n--- Tickets ---');
    const totalTickets = await Ticket.countDocuments();
    console.log('Total tickets (countDocuments):', totalTickets);

    const allTickets = await Ticket.find({}).exec();
    console.log('Total tickets (find):', allTickets.length);

    process.exit(0);
}

debug().catch(console.error);
