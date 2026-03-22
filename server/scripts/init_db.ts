import { getDbClient } from "../../src/db/client";
import * as fs from "fs";
import * as path from "path";

// Initialize the database for local development/testing
const dbPath = process.env.DATABASE_URL || "sqlite://local.db";
console.log(`Initializing database at ${dbPath}`);

const dbClient = getDbClient();

try {
  // Use project root path for migrations
  const migrationsDir = path.resolve(process.cwd(), "../src/db/migrations");

  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (file.endsWith(".sql")) {
        console.log(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        dbClient.applyMigration(sql);
      }
    }
    console.log("Database initialized successfully!");
  } else {
    console.error(`Migrations directory not found at: ${migrationsDir}`);
  }
} catch (error) {
  console.error("Failed to initialize database:", error);
}
