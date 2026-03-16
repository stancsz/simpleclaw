import { DBClient } from './client';
import * as fs from 'fs';
import * as path from 'path';

console.log('Setting up local SQLite database...');
const dbClient = new DBClient();
const migrationSql = fs.readFileSync(path.join(process.cwd(), 'src', 'db', 'migrations', '001_motherboard.sql'), 'utf-8');
dbClient.applyMigration(migrationSql);
console.log('Database setup complete: local.db');
