import { DBClient } from "../src/db/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationSql = fs.readFileSync(
  path.join(__dirname, "..", "..", "src", "db", "migrations", "001_motherboard.sql"),
  "utf-8"
);
const dbClient = new DBClient("sqlite://local.db");
dbClient.applyMigration(migrationSql);
console.log("Database initialized");
