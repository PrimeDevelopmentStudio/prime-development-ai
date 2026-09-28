require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!TOKEN || !CLIENT_ID || !GEMINI_KEY) {
  console.error("❌ Missing environment variables!");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_KEY
});

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const aiChannels = new Map();
const logChannels = new Map();
const warnings = new Map();
const cooldown = new Map();

async function askAI(text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await ai.models.generateContent({
        model: MODEL,
        contents: text
      });

      return r.text || "⚠️ Empty AI response.";
    } catch (e) {
      console.error("Gemini:", e.message);

      if (attempt < 3) {
        await new Promise(x => setTimeout(x, 2000 * attempt));
      }
    }
  }

  return "⚠️ Gemini is temporarily unavailable. Please try again.";
}

const commands = [
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Ask Prime AI")
    .addStringOption(o =>
      o.setName("question")
       .setDescription("Your question")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setaichannel")
    .setDescription("Set this channel for automatic AI replies"),

  new SlashCommandBuilder()
    .setName("removeaichannel")
    .setDescription("Disable automatic AI replies"),

  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set this channel for logs"),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
       .setDescription("Reason")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages")
    .addIntegerOption(o =>
      o.setName("amount")
       .setDescription("1-100")
       .setMinValue(1)
       .setMaxValue(100)
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout member")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
       .setDescription("Minutes")
       .setMinValue(1)
       .setMaxValue(10080)
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick member")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban member")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban user")
    .addStringOption(o =>
      o.setName("userid")
       .setDescription("User ID")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock channel"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock channel"),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode")
    .addIntegerOption(o =>
      o.setName("seconds")
       .setDescription("0-21600")
       .setMinValue(0)
       .setMaxValue(21600)
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Server information"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("User information")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("User")
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show avatar")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("User")
    ),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Bot settings"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show commands")
].map(x => x.toJSON());

bot.once("ready", async () => {
  console.log(`✅ Logged in as ${bot.user.tag}`);
  console.log(`🧠 Gemini: ${MODEL}`);

  bot.user.setActivity("Prime Development Studio", {
    type: 3
  });

  const rest = new REST({ version: "10" })
    .setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ ${commands.length} commands registered`);
  } catch (e) {
    console.error("❌ Command error:", e);
  }
});

bot.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const g = i.guild;
  const c = i.commandName;

  try {

    if (c === "ai") {
      await i.deferReply();

      const q = i.options.getString("question");

      const a = await askAI(
        `You are Prime AI for Prime Development Studio.
Answer clearly and helpfully.

User:
${q}`
      );

      return i.editReply(a.slice(0, 1900));
    }

    if (c === "setaichannel") {
      aiChannels.set(g.id, i.channel.id);
      return i.reply(`✅ AI channel set to ${i.channel}`);
    }

    if (c === "removeaichannel") {
      aiChannels.delete(g.id);
      return i.reply("✅ AI channel disabled.");
    }

    if (c === "setlogchannel") {
      logChannels.set(g.id, i.channel.id);
      return i.reply(`✅ Log channel set to ${i.channel}`);
    }

    if (c === "warn") {
      const u = i.options.getUser("user");
      const r = i.options.getString("reason");
      const k = `${g.id}-${u.id}`;

      const w = warnings.get(k) || [];
      w.push(r);
      warnings.set(k, w);

      return i.reply(`⚠️ ${u} warned.\nReason: ${r}`);
    }

    if (c === "warnings") {
      const u = i.options.getUser("user");
      const w = warnings.get(`${g.id}-${u.id}`) || [];

      return i.reply(
        w.length
          ? `⚠️ Warnings for ${u}:\n${w.map((x,n) => `${n+1}. ${x}`).join("\n")}`
          : `✅ ${u} has no warnings.`
      );
    }

    if (c === "clear") {
      const n = i.options.getInteger("amount");

      await i.channel.bulkDelete(n, true);

      return i.reply({
        content: `🧹 Deleted ${n} messages.`,
        ephemeral: true
      });
    }

    if (c === "timeout") {
      const u = i.options.getUser("user");
      const m = i.options.getInteger("minutes");
      const member = await g.members.fetch(u.id);

      await member.timeout(m * 60000);

      return i.reply(
        `🔇 ${u} timed out for ${m} minutes.`
      );
    }

    if (c === "untimeout") {
      const u = i.options.getUser("user");
      const member = await g.members.fetch(u.id);

      await member.timeout(null);

      return i.reply(`🔊 Timeout removed from ${u}.`);
    }

    if (c === "kick") {
      const u = i.options.getUser("user");

      await g.members.kick(u.id);

      return i.reply(`👢 ${u.tag} kicked.`);
    }

    if (c === "ban") {
      const u = i.options.getUser("user");

      await g.members.ban(u.id);

      return i.reply(`🔨 ${u.tag} banned.`);
    }

    if (c === "unban") {
      const id = i.options.getString("userid");

      await g.members.unban(id);

      return i.reply(`✅ ${id} unbanned.`);
    }

    if (c === "lock") {
      await i.channel.permissionOverwrites.edit(
        g.roles.everyone,
        { SendMessages: false }
      );

      return i.reply("🔒 Channel locked.");
    }

    if (c === "unlock") {
      await i.channel.permissionOverwrites.edit(
        g.roles.everyone,
        { SendMessages: null }
      );

      return i.reply("🔓 Channel unlocked.");
    }

    if (c === "slowmode") {
      const s = i.options.getInteger("seconds");

      await i.channel.setRateLimitPerUser(s);

      return i.reply(`🐌 Slowmode: ${s}s`);
    }

    if (c === "serverinfo") {
      return i.reply(
        `📊 **${g.name}**\n👥 Members: ${g.memberCount}\n📁 Channels: ${g.channels.cache.size}`
      );
    }

    if (c === "userinfo") {
      const u =
        i.options.getUser("user") || i.user;

      return i.reply(
        `👤 **${u.tag}**\n🆔 ${u.id}\n🤖 Bot: ${u.bot}`
      );
    }

    if (c === "avatar") {
      const u =
        i.options.getUser("user") || i.user;

      return i.reply(
        u.displayAvatarURL({
          size: 1024,
          extension: "png"
        })
      );
    }

    if (c === "settings") {
      return i.reply(
        `⚙️ **Prime AI Settings**\n\n🤖 AI: ${
          aiChannels.get(g.id)
            ? `<#${aiChannels.get(g.id)}>`
            : "Not Set"
        }\n📋 Logs: ${
          logChannels.get(g.id)
            ? `<#${logChannels.get(g.id)}>`
            : "Not Set"
        }\n🧠 Model: \`${MODEL}\``
      );
    }

    if (c === "help") {
      return i.reply(
        `🤖 **Prime Development AI**

🧠 AI
/ai
/setaichannel
/removeaichannel

🛡️ Moderation
/warn
/warnings
/clear
/timeout
/untimeout
/kick
/ban
/unban

🔒 Channel
/lock
/unlock
/slowmode

📊 Info
/serverinfo
/userinfo
/avatar

⚙️ System
/setlogchannel
/settings
/help`
      );
    }

  } catch (e) {
    console.error("❌ Interaction:", e);

    if (!i.replied && !i.deferred) {
      await i.reply("❌ An error occurred.");
    }
  }
});

bot.on("messageCreate", async m => {
  if (m.author.bot || !m.guild) return;

  if (aiChannels.get(m.guild.id) !== m.channel.id) {
    return;
  }

  const key = `${m.guild.id}-${m.author.id}`;
  const now = Date.now();

  if (now - (cooldown.get(key) || 0) < 5000) {
    return;
  }

  cooldown.set(key, now);

  await m.channel.sendTyping();

  const answer = await askAI(
    `You are Prime AI, the official assistant of Prime Development Studio.

Answer the user naturally and helpfully.

User:
${m.author.username}

Message:
${m.content}`
  );

  for (let x = 0; x < answer.length; x += 1900) {
    await m.channel.send(
      answer.slice(x, x + 1900)
    );
  }
});

const app = express();

app.get("/", (req, res) => {
  res.send("🚀 Prime Development AI is online!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    model: MODEL,
    uptime: process.uptime()
  });
});

app.listen(
  process.env.PORT || 3000,
  () => console.log("🌐 Web server online")
);

bot.login(TOKEN);
