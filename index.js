require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, AuditLogEvent
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Missing DISCORD_TOKEN or CLIENT_ID in environment variables!");
  process.exit(1);
}

// Database & Caches
const DATA_FILE = path.join(__dirname, "data.json");
const DEFAULT = { guilds: {}, users: {}, warnings: {}, giveaways: {} };
const joinLog = [];
const actionCache = new Map();

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(DEFAULT);
    const x = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { ...structuredClone(DEFAULT), ...x };
  } catch (e) {
    return structuredClone(DEFAULT);
  }
}
let db = loadData();
let saveTimer;
function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) {}
  }, 200);
}

function gd(id) {
  db.guilds[id] ??= { aiChannelId: null, welcomeChannelId: null, antiLink: true, antiRaid: true, antiNuke: true, logChannelId: null, autoroleId: null };
  return db.guilds[id];
}
function ud(guildId, userId) {
  const key = `${guildId}:${userId}`;
  db.users[key] ??= { cash: 100, xp: 0, level: 1, lastDaily: 0 };
  return db.users[key];
}

// Direct Native Fetch for Gemini AI (No version mismatch issues!)
async function askGemini(promptText) {
  if (!GEMINI_API_KEY) return "❌ Gemini API Key is missing in environment variables.";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
  } catch (err) {
    console.error("AI Error:", err);
    return "❌ AI is currently unavailable.";
  }
}

async function sendLog(guild, text) {
  const id = gd(guild.id).logChannelId;
  if (!id) return;
  const ch = guild.channels.cache.get(id);
  if (ch) await ch.send(`📋 ${text}`).catch(() => {});
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

// Commands List
const commands = [
  new SlashCommandBuilder().setName("ai").setDescription("Ask Gemini AI").addStringOption(o => o.setName("question").setDescription("Your question").setRequired(true)),
  new SlashCommandBuilder().setName("serverinfo").setDescription("View server info"),
  new SlashCommandBuilder().setName("balance").setDescription("Check your cash balance").addUserOption(o => o.setName("user").setDescription("User").setRequired(false)),
  new SlashCommandBuilder().setName("daily").setDescription("Claim daily cash reward"),
  new SlashCommandBuilder().setName("rank").setDescription("Check your XP and Level"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("View XP leaderboard"),
  new SlashCommandBuilder().setName("clear").setDescription("Delete messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName("amount").setDescription("1-100").setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName("help").setDescription("List all commands")
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(`🚀 Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash commands registered successfully!");
  } catch (e) {
    console.error("Command Registration Error:", e);
  }
});

// Interactions Handler
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand() || !i.guild) return;
  const g = i.guild, c = i.commandName;

  try {
    if (c === "ai") {
      await i.deferReply();
      const q = i.options.getString("question");
      const ans = await askGemini(q);
      return i.editReply(ans.length > 2000 ? ans.slice(0, 1997) + "..." : ans);
    }
    if (c === "serverinfo") {
      return i.reply(`🏠 **${g.name}**\n👥 Members: ${g.memberCount}\n🆔 ID: ${g.id}`);
    }
    if (c === "balance") {
      const u = i.options.getUser("user") || i.user;
      return i.reply(`💰 **${u.username}** has **$${ud(g.id, u.id).cash}** cash.`);
    }
    if (c === "daily") {
      const udata = ud(g.id, i.user.id), now = Date.now();
      if (now - udata.lastDaily < 86400000) {
        return i.reply({ content: `⏳ Claim again <t:${Math.floor((udata.lastDaily + 86400000) / 1000)}:R>.`, ephemeral: true });
      }
      udata.cash += 500; udata.lastDaily = now; saveData();
      return i.reply("💵 You claimed your daily **$500** cash!");
    }
    if (c === "rank") {
      const u = i.options.getUser("user") || i.user;
      const udata = ud(g.id, u.id);
      return i.reply(`📈 **${u.username}** — Level **${udata.level}** | XP: **${udata.xp}**`);
    }
    if (c === "leaderboard") {
      const rows = Object.entries(db.users).filter(([k]) => k.startsWith(g.id + ":")).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
      return i.reply(rows.length ? `🏆 **Leaderboard**\n${rows.map(([k, d], n) => `${n + 1}. <@${k.split(":")[1]}> — Lv.${d.level} (${d.xp} XP)`).join("\n")}` : "No XP data yet.");
    }
    if (c === "clear") {
      const n = i.options.getInteger("amount");
      await i.channel.bulkDelete(n, true);
      return i.reply({ content: `🧹 Cleared ${n} messages.`, ephemeral: true });
    }
    if (c === "help") {
      return i.reply("🤖 **Bot Commands:** `/ai`, `/serverinfo`, `/balance`, `/daily`, `/rank`, `/leaderboard`, `/clear`");
    }
  } catch (err) {
    console.error(err);
    if (!i.replied && !i.deferred) await i.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
  }
});

// Auto-Mod & Anti-Link & XP System
client.on("messageCreate", async msg => {
  if (msg.author.bot || !msg.guild) return;
  const g = gd(msg.guild.id);

  // Anti-Link
  if (g.antiLink && /(https?:\/\/|www\.)\S+/i.test(msg.content) && !msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await msg.delete().catch(() => {});
    const m = await msg.channel.send(`🔗 ${msg.author}, links are not allowed here!`).catch(() => null);
    if (m) setTimeout(() => m.delete().catch(() => {}), 4000);
    return;
  }

  // XP System
  const udata = ud(msg.guild.id, msg.author.id);
  udata.xp += 10;
  if (udata.xp >= udata.level * 100) {
    udata.xp -= udata.level * 100;
    udata.level++;
    msg.channel.send(`🎉 Congrats ${msg.author}, you leveled up to **Level ${udata.level}**!`).catch(() => {});
  }
  saveData();
});

// Anti-Raid & Anti-Nuke Protections
client.on("guildMemberAdd", async member => {
  const g = gd(member.guild.id);
  if (g.antiRaid) {
    const now = Date.now();
    joinLog.push(now);
    while (joinLog.length > 0 && joinLog[0] < now - 10000) joinLog.shift();
    if (joinLog.length >= 5 && member.kickable) {
      await member.kick("Anti-Raid Triggered");
      return;
    }
  }
});

client.on("channelDelete", async channel => {
  if (!channel.guild) return;
  const g = gd(channel.guild.id);
  if (!g.antiNuke) return;
  const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
  const entry = logs?.entries.first();
  if (entry && entry.executor.id !== client.user.id && entry.executor.id !== channel.guild.ownerId) {
    const member = await channel.guild.members.fetch(entry.executor.id).catch(() => null);
    if (member && member.bannable) {
      await member.ban({ reason: "Anti-Nuke: Channel Deletion Protection" });
    }
  }
});

// Express Web Server for Render 24/7 Uptime
const app = express();
app.get("/", (_, res) => res.send("Bot is running perfectly."));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

client.login(TOKEN).catch(e => console.error("Login Failed:", e));
