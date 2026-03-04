#!/usr/bin/env node
/**
 * Comprehensive Test Suite for Ticket Bot
 * Tests all major components before deployment
 */

import { connectDatabase, getDb } from './src/database/database.js';
import Ticket from './src/database/models/Ticket.js';
import Config from './src/database/models/Config.js';
import Category from './src/database/models/Category.js';
import StaffPoints from './src/database/models/StaffPoints.js';
import fs from 'fs';
import path from 'path';

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: '❌ FAIL', error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: '❌ FAIL', error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

console.log('🧪 Starting Ticket Bot Test Suite...\n');

// ==========================================
// 1. DATABASE TESTS
// ==========================================
console.log('📦 DATABASE TESTS');
console.log('=================');

await asyncTest('Database connection', async () => {
  await connectDatabase();
  const db = getDb();
  if (!db) throw new Error('Database not connected');
});

await asyncTest('Database file exists', async () => {
  const dbPath = path.join(process.cwd(), 'database.sqlite');
  if (!fs.existsSync(dbPath)) {
    throw new Error('database.sqlite file not found');
  }
});

// ==========================================
// 2. MODEL TESTS
// ==========================================
console.log('\n📋 MODEL TESTS');
console.log('==============');

await asyncTest('Ticket model - findByChannelId', async () => {
  const result = Ticket.findByChannelId('test-channel-123');
  // Should return null or object, not throw
});

await asyncTest('Ticket model - findOne', async () => {
  const result = await Ticket.findOne({ channelId: 'test-channel-123' });
  // Should return null or object, not throw
});

await asyncTest('Config model - findOne', async () => {
  const result = await Config.findOne({ guildId: 'test-guild-123' });
  // Should return null or object, not throw
});

await asyncTest('Category model - findById', async () => {
  const result = await Category.findById(999999);
  // Should return null or object, not throw
});

await asyncTest('StaffPoints model - getStaffStats', async () => {
  const result = await StaffPoints.getStaffStats('test-guild-123', 'test-user-123');
  // Should return null or object, not throw
});


// ==========================================
// 3. FILE SYSTEM TESTS
// ==========================================
console.log('\n📁 FILE SYSTEM TESTS');
console.log('====================');

await asyncTest('Transcripts directory exists or can be created', async () => {
  const transcriptsDir = path.join(process.cwd(), 'transcripts');
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
  }
  if (!fs.existsSync(transcriptsDir)) {
    throw new Error('Cannot create transcripts directory');
  }
});

await asyncTest('Can write and read files', async () => {
  const testFile = path.join(process.cwd(), 'transcripts', 'test-file.txt');
  fs.writeFileSync(testFile, 'test content');
  const content = fs.readFileSync(testFile, 'utf8');
  if (content !== 'test content') {
    throw new Error('File read/write mismatch');
  }
  fs.unlinkSync(testFile);
});

// ==========================================
// 4. CODE SYNTAX TESTS
// ==========================================
console.log('\n🔍 CODE SYNTAX TESTS');
console.log('====================');

test('ticketButtons.js - imports check', () => {
  const content = fs.readFileSync('./src/systems/ticket/ticketButtons.js', 'utf8');
  
  // Check for required imports
  if (!content.includes('AttachmentBuilder')) {
    throw new Error('AttachmentBuilder not imported');
  }
  if (!content.includes('generateHTMLTranscript')) {
    throw new Error('generateHTMLTranscript not imported');
  }
});

test('ticketButtons.js - no duplicate function declarations', () => {
  const content = fs.readFileSync('./src/systems/ticket/ticketButtons.js', 'utf8');
  
  // Check for common duplicates
  const duplicates = [
    'export async function handleCloseModal',
    'export async function handleReopenButton',
    'export async function handleDeleteTranscriptModal'
  ];
  
  for (const func of duplicates) {
    const matches = content.match(new RegExp(func, 'g'));
    if (matches && matches.length > 1) {
      throw new Error(`Duplicate function: ${func}`);
    }
  }
});

test('ticketButtons.js - AttachmentBuilder usage', () => {
  const content = fs.readFileSync('./src/systems/ticket/ticketButtons.js', 'utf8');
  
  if (!content.includes('new AttachmentBuilder')) {
    throw new Error('AttachmentBuilder not instantiated');
  }
  if (!content.includes('.setName(')) {
    throw new Error('AttachmentBuilder setName not used');
  }
});

test('database.js - sql.js usage', () => {
  const content = fs.readFileSync('./src/database/database.js', 'utf8');
  
  if (!content.includes('sql.js')) {
    throw new Error('sql.js not imported');
  }
  if (!content.includes('new SQL.Database')) {
    throw new Error('SQL.Database not instantiated');
  }
});

// ==========================================
// 5. CONFIGURATION TESTS
// ==========================================
console.log('\n⚙️  CONFIGURATION TESTS');
console.log('======================');

test('.env file exists or can be created', () => {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.log('   ⚠️  .env not found - will use environment variables');
  }
});

test('package.json - dependencies check', () => {
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  
  const required = ['discord.js', 'sql.js', 'chalk'];
  for (const dep of required) {
    if (!packageJson.dependencies[dep]) {
      throw new Error(`Missing dependency: ${dep}`);
    }
  }
});

// ==========================================
// 6. TRANSCRIPT GENERATION TEST
// ==========================================
console.log('\n📝 TRANSCRIPT GENERATION TEST');
console.log('=============================');

await asyncTest('transcriptGenerator.js - exists and exports', async () => {
  const content = fs.readFileSync('./src/systems/ticket/transcriptGenerator.js', 'utf8');
  if (!content.includes('export function generateHTMLTranscript')) {
    throw new Error('generateHTMLTranscript not exported');
  }
});

// ==========================================
// 7. DISCORD.JS IMPORT TEST
// ==========================================
console.log('\n🤖 DISCORD.JS TEST');
console.log('==================');

test('discord.js imports - AttachmentBuilder', () => {
  const content = fs.readFileSync('./src/systems/ticket/ticketButtons.js', 'utf8');
  
  // Check that AttachmentBuilder is in the import
  const importMatch = content.match(/import \{([^}]+)\} from 'discord\.js'/);
  if (!importMatch) {
    throw new Error('No discord.js import found');
  }
  
  if (!importMatch[1].includes('AttachmentBuilder')) {
    throw new Error('AttachmentBuilder not in discord.js imports');
  }
});

// ==========================================
// SUMMARY
// ==========================================
console.log('\n' + '='.repeat(50));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(50));
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`📈 Total: ${results.passed + results.failed}`);

if (results.failed === 0) {
  console.log('\n🎉 ALL TESTS PASSED! Ready for PebbleHost deployment!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
}
