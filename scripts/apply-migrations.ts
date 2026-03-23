import { getDbClient } from "../src/db/client";
import { readFileSync } from "fs";
import { join } from "path";

async function runMigration() {
    console.log("Applying migrations to initialize SQLite tables...");
    const dbClient = getDbClient();

    // Read the migration file
    const migrationPath = join(process.cwd(), "src", "db", "migrations", "001_motherboard.sql");
    const migrationSql = readFileSync(migrationPath, "utf-8");

    // Apply migrations by reinitializing the database
    // Note: initDb() already applies the migration from the same file
    dbClient.initDb();
    console.log("Migrations applied successfully.");
}

runMigration().catch(console.error);
