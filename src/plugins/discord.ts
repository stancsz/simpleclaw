import { Client, GatewayIntentBits } from "discord.js";
import { aiIpiSanitizer } from "../security/triple_lock.ts";
import type { Extension } from "../core/extensions.ts";
import "dotenv/config";

// Initialize Discord Client for Gateway mode
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let isBotReady = false;

client.once("clientReady", async (c) => {
  console.log(`🚀 Discord Bot logged in as ${c.user?.tag}`);
  isBotReady = true;

  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const channelId = process.env.DISCORD_CHANNEL_ID;
    
    if (guildId && channelId) {
      const guild = c.guilds.cache.get(guildId);
      if (!guild) {
        console.error(`❌ Bot is NOT in guild ${guildId}. Please invite it!`);
        return;
      }

      const channel = await c.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await (channel as any).send("Hello! SimpleClaw is now online and monitoring this channel. 🦀");
        console.log(`✅ Posted startup message to channel ${channelId}`);
      }
    }
  } catch (error: any) {
    console.error("❌ Failed to post startup message:", error.message);
  }
});

import OpenAI from "openai";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

import { executeNativeTool } from "../core/executor.ts";

client.on("messageCreate", async (message) => {
  const guildId = (process.env.DISCORD_GUILD_ID || "").trim();
  const channelId = (process.env.DISCORD_CHANNEL_ID || "").trim();

  console.log(`📡 Raw Message Detected: "${message.content}" from ${message.author.tag} in channel ${message.channelId}`);
  
  if (message.author.bot) return;

  const isMentioned = client.user && message.mentions.has(client.user);
  const isDirectChannel = message.channelId === channelId;

  console.log(`🔍 Check: Mentioned=${!!isMentioned}, DirectChannel=${isDirectChannel} (Target: ${channelId})`);

  if (!isMentioned && !isDirectChannel) {
    console.log(`⏭️ Skipping message: Not mentioned and not in target channel.`);
    return;
  }

  // Guardian Lock implementation
  const sanitizedContent = aiIpiSanitizer(message.content);

  try {
    await message.channel.sendTyping();

    const tools = [
      {
        type: "function",
        function: {
          name: "shell",
          description: "Execute a shell command",
          parameters: {
            type: "object",
            properties: { cmd: { type: "string" } },
            required: ["cmd"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "read",
          description: "Read a file from disk",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are SimpleClaw. You have access to native tools. Use them to fulfill requests." },
        { role: "user", content: sanitizedContent }
      ],
      tools: tools as any,
    });

    const aiMessage = response.choices[0].message;

    if (aiMessage.tool_calls) {
      for (const toolCall of aiMessage.tool_calls as any[]) {
        const { name, arguments: argsString } = toolCall.function;
        const args = JSON.parse(argsString);
        console.log(`🛠️ Executing Tool [${name}]: ${argsString}`);
        
        const result = await executeNativeTool(name, args);
        console.log(`✅ Tool Result: ${result}`);

        // Sending the final tool result back to the user
        await message.reply(`\`\`\`\n${result}\n\`\`\``);
      }
    } else {
      await message.reply(aiMessage.content || "I'm not sure how to respond to that.");
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    await message.reply(`⚠️ Error: ${error.message}`);
  }
});

// Removed side-effect login to prevent ghost instances
export const startBot = async () => {
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      await client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (err: any) {
      console.error("Failed to login to Discord:", err.message);
    }
  }
};

export const plugin: Extension = {
  name: "discord",
  type: "webhook", // Kept as webhook type to maintain registry compatibility
  route: "/discord",
  start: startBot, // Add start capability
  execute: async (req: Request): Promise<Response> => {
    // This allows manual triggering via webhook if needed
    return new Response(JSON.stringify({ 
      status: "ok", 
      bot_ready: isBotReady,
      bot_user: client.user?.tag || "Unknown",
      message: "Gateway bot is active. Mention the bot to chat!" 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};
