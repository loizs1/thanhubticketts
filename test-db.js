import Config from './src/database/models/Config.js';
import { connectDatabase, getDb } from './src/database/database.js';
import fs from 'fs';

async function testPersistence() {
    console.log('--- Database Persistence Test ---');

    await connectDatabase();
    const testGuildId = 'TEST_GUILD_' + Date.now();

    console.log('1. Creating config...');
    await Config.create({
        guildId: testGuildId,
        panelTitle: 'Test Panel',
        panelMessageId: '123456',
        createTicketChannelId: '7890'
    });

    const config = await Config.findOne({ guildId: testGuildId });
    console.log('   Saved to memory:', config ? 'YES' : 'NO');

    console.log('2. Verifying file state...');
    // Check if file exists and has content
    const dbPath = './database.sqlite';
    const stats = fs.statSync(dbPath);
    console.log(`   File size: ${stats.size} bytes`);

    process.exit(0);
}

testPersistence().catch(err => {
    console.error(err);
    process.exit(1);
});
