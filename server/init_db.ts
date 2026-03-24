import { DBClient } from "../src/db/client";
import * as fs from "fs";

const db = new DBClient("sqlite://local.db");
const schema = fs.readFileSync("../src/db/migrations/001_motherboard.sql", "utf-8");
db.applyMigration(schema);
console.log("Database initialized");
