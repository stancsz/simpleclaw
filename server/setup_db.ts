import { DBClient } from "../src/db/client";
import fs from "fs";
import path from "path";

const migrationSql = fs.readFileSync(path.join(process.cwd(), "..", "src", "db", "migrations", "001_motherboard.sql"), 'utf-8');
const dbClient = new DBClient("sqlite://local.db");
dbClient.applyMigration(migrationSql);
console.log("Database initialized");
