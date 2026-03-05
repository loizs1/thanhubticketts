import { connectDatabase, getDb } from './src/database/database.js';
import Ticket from './src/database/models/Ticket.js';
import fs from 'fs';
import initSqlJs from 'sql.js';

async function testClear() {
    console.log('--- Clear Command Persistence Test ---');

    await connectDatabase();
    const db = getDb();

    console.log('1. Seeding data...');
    await Ticket.create({
        guildId: 'CLEAR_TEST',
        channelId: 'CH_TEST_' + Date.now(),
        userId: 'U1',
        username: 'user1',
        category: 'General',
        subject: 'test'
    });

    let count = await Ticket.countDocuments();
    console.log('   Tickets before clear:', count);

    console.log('2. Running clear (exec DELETE FROM tickets)...');
    db.exec('DELETE FROM tickets');

    count = await Ticket.countDocuments();
    console.log('   Tickets after clear (memory):', count);

    console.log('3. Verifying file state...');
    const dbPath = './database.sqlite';
    const fileBuffer = fs.readFileSync(dbPath);

    const SQL = await initSqlJs();
    const tempDb = new SQL.Database(fileBuffer);
    const result = tempDb.exec('SELECT COUNT(*) as count FROM tickets');
    const fileCount = result[0].values[0][0];

    console.log('   Tickets in saved file:', fileCount);

    if (fileCount === 0) {
        console.log('✅ PASS: Bulk delete persisted to file.');
    } else {
        console.log('❌ FAIL: Bulk delete did not persist!');
    }

    process.exit(0);
}

testClear().catch(err => {
    console.error(err);
    process.exit(1);
});
