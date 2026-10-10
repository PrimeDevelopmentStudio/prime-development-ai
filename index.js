require("dotenv").config();
const express = require("express");
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, ChannelType, AuditLogEvent
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Missing DISCORD_TOKEN or CLIENT_ID!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildAuditLogs
  ]
});

// Fast Memory Cache for Speed (No heavy file writing on every message)
const userCache = new Map();
const joinLog = [];

// Ultra-fast Gemini AI Fetch (Non-blocking)
async function askAI(promptText) {
  if (!GEMINI_API_KEY) return "❌ AI Key missing.";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
  } catch (e) {
    return "❌ AI is busy right now.";
  }
}

// Register Fast Slash Commands
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot speed/latency"),
  new SlashCommandBuilder().setName("ai").setDescription("Ask Gemini AI instantly").addStringOption(o => o.setName("query").setDescription("Question").setRequired(true)),
  new SlashCommandBuilder().setName("clear").setDescription("Fast purge messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName("count").setDescription("1-100").setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName("server").setDescription("Fast server info")
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(`⚡ Lightning Fast Bot Online as ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("⚡ Slash Commands Registered Instantly!");
  } catch (e) {
    console.error(e);
  }
});

// Instant Interaction Handler
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  try {
    if (i.commandName === "ping") {
      const latency = Date.now() - i.createdTimestamp;
      return i.reply({ content: `🏓 Pong! Latency: **${latency}ms** | API: **${Math.round(client.ws.ping)}ms**`, ephemeral: true });
    }

    if (i.commandName === "ai") {
      await i.deferReply();
      const q = i.options.getString("query");
      const ans = await askAI(q);
      return i.editReply(ans.length > 2000 ? ans.slice(0, 1997) + "..." : ans);
    }

    if (i.commandName === "clear") {
      const count = i.options.getInteger("count");
      await i.channel.bulkDelete(count, true);
      return i.reply({ content: `🧹 Fast deleted ${count} messages.`, ephemeral: true });
    }

    if (i.commandName === "server") {
      return i.reply(`🏠 Server: **${i.guild.name}**\n👥 Members: **${i.guild.memberCount}**`);
    }
  } catch (err) {
    if (!i.replied && !i.deferred) await i.reply({ content: "❌ Error occurred.", ephemeral: true }).catch(() => {});
  }
});

// Fast Auto-Mod & Anti-Link (Instant Deletion)
client.on("messageCreate", async msg => {
  if (msg.author.bot || !msg.guild) return;

  // Instant Link Protection
  if (/(https?:\/\/|www\.)\S+/i.test(msg.content) && !msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await msg.delete().catch(() => {});
    const warning = await msg.channel.send(`⚠️ ${msg.author}, links are not allowed here!`).catch(() => null);
    if (warning) setTimeout(() => warning.delete().catch(() => {}), 3000);
  }
});

// Anti-Raid Quick Trigger
client.on("guildMemberAdd", async member => {
  const now = Date.now();
  joinLog.push(now);
  while (joinLog.length > 0 && joinLog[0] < now - 10000) joinLog.shift();
  
  if (joinLog.length >= 5 && member.kickable) {
    await member.kick("Anti-Raid Protection").catch(() => {});
  }
});

// Lightweight Express Server for 24/7 Hosting Uptime
const app = express();
app.get("/", (_, res) => res.send("Bot is lightning fast and online!"));
app.listen(PORT, () => console.log(`🌐 Fast Web Server active on port ${PORT}`));

client.login(TOKEN);
