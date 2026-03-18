import { Client, GatewayIntentBits, Message } from "discord";
import { aiIpiSanitizer } from "../security/triple_lock";
import type { Extension } from "../core/extensions";
import { createAgentDispatcher, type RuntimeDispatchEvent } from "../core/dispatcher";
import "dotenv/config";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const dispatcher = createAgentDispatcher();
const DISCORD_SCOPE_PREFIX = "discord:channel:";
let isBotReady = false;

async function handleDiscordEvent(event: RuntimeDispatchEvent, message: Message): Promise<void> {
  switch (event.type) {
    case "taskStarted":
    case "iterationStarted":
    case "iterationProgress":
    case "toolStarted":
      if (message.channel.isTextBased()) {
        await (message.channel as any).sendTyping();
      }
      break;
    case "taskFailed":
      await message.reply(`⚠️ Error: ${event.error.message}`);
      break;
    default:
      break;
  }
}

async function sendDiscordReply(message: Message, content: string): Promise<void> {
  if (content.length <= 2000) {
    await message.reply(content);
    return;
  }

  for (let i = 0; i < content.length; i += 2000) {
    if (message.channel.isTextBased()) {
      await (message.channel as any).send(content.substring(i, i + 2000));
    }
  }
}

async function buildDiscordHistory(message: Message, botUserId?: string) {
  const historyMessages = await message.channel.messages.fetch({ limit: 10 });
  return Array.from(historyMessages.values())
    .filter((m: Message) => m.id !== message.id)
    .reverse()
    .map((m: Message) => ({
      role: (m.author.id === botUserId ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    }));
}

async function dispatchDiscordMessage(message: Message, content: string, botUserId?: string) {
  const result = await dispatcher.submit({
    source: "discord",
    prompt: content,
    scope: `${DISCORD_SCOPE_PREFIX}${message.channelId}`,
    history: await buildDiscordHistory(message, botUserId),
    model: "gpt-5-nano",
    onEvent: (event) => handleDiscordEvent(event, message),
  });

  if (result.content) {
    await sendDiscordReply(message, result.content);
  } else if (!result.completed) {
    await message.reply("⚠️ Reached maximum task depth. Stopping.");
  }
}

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
    await dispatchDiscordMessage(message, sanitizedContent, client.user?.id);
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
  activation: "transport",
  runtimeModes: ["server", "hybrid"],
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
