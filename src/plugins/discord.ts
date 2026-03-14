import { Client, GatewayIntentBits } from "discord.js";
import { aiIpiSanitizer } from "../security/triple_lock.ts";
import type { Extension } from "../core/extensions.ts";
import { runAgentLoop } from "../core/agent.ts";
import "dotenv/config";

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

  const guilds = c.guilds.cache.map((g) => `${g.name} (${g.id})`).join(", ");
  console.log(`🏠 Joined Guilds: ${guilds}`);

  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (guildId && channelId) {
      const guild = c.guilds.cache.get(guildId);
      if (!guild) {
        console.error(`❌ Bot is NOT in guild ${guildId}. Found in: ${guilds}`);
        return;
      }

      const channel = await c.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await (channel as any).send("Hello! SimpleClaw is now online and monitoring this channel. 🦀");
        console.log(`✅ Posted startup message to channel ${channelId} in guild ${guild.name}`);
      }
    }
  } catch (error: any) {
    console.error("❌ Failed to post startup message:", error.message);
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const channelId = (process.env.DISCORD_CHANNEL_ID || "").trim();
  const isMentioned = client.user && message.mentions.has(client.user);
  const isDirectChannel = message.channelId === channelId;

  console.log(`📡 Message from ${message.author.tag}: "${message.content}"`);

  if (!isMentioned && !isDirectChannel) return;

  const sanitizedContent = aiIpiSanitizer(message.content);

  try {
    await message.channel.sendTyping();

    const historyCount = 10;
    const historyMessages = await message.channel.messages.fetch({ limit: historyCount });
    const history = Array.from(historyMessages.values())
      .filter((m) => m.id !== message.id)
      .reverse()
      .map((m) => ({
        role: (m.author.id === client.user?.id ? "assistant" : "user") as "assistant" | "user",
        content: m.content,
      }));

    const result = await runAgentLoop(
      sanitizedContent,
      {
        model: "gpt-5-nano",
        onIteration: async () => {
          await message.channel.sendTyping();
        },
      },
      history,
    );

    if (result.content) {
      const content = result.content;
      if (content.length <= 2000) {
        await message.reply(content);
      } else {
        for (let i = 0; i < content.length; i += 2000) {
          const chunk = content.substring(i, i + 2000);
          await message.channel.send(chunk);
        }
      }
    } else if (!result.completed) {
      await message.reply("⚠️ Reached maximum task depth. Stopping.");
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    await message.reply(`⚠️ Error: ${error.message}`);
  }
});

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
  type: "webhook",
  route: "/discord",
  start: startBot,
  execute: async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        status: "ok",
        bot_ready: isBotReady,
        bot_user: client.user?.tag || "Unknown",
        message: "Gateway bot is active. Mention the bot to chat!",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
