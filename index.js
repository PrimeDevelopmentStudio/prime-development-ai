require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const API_KEY = process.env.GEMINI_API_KEY;

const MODEL = "gemini-3.8-flash";

if (!TOKEN || !CLIENT_ID || !API_KEY) {
  console.error("❌ Missing Environment Variables");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: API_KEY
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
  try {
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: text
    });

    return result.text || "⚠️ Empty AI response.";
  } catch (e) {
    console.error("❌ GEMINI ERROR:", e);
    return "⚠️ Gemini is temporarily unavailable.";
  }
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
    .setDescription("Set AI channel"),

  new SlashCommandBuilder()
    .setName("removeaichannel")
    .setDescription("Remove AI channel"),

  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set log channel"),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement")
    .addStringOption(o =>
      o.setName("message")
       .setDescription("Announcement")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("embedannounce")
    .setDescription("Send embed announcement")
    .addStringOption(o =>
      o.setName("title")
       .setDescription("Announcement title")
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message")
       .setDescription("Announcement message")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn member")
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
       .setDescription("Seconds")
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
    .setDescription("Bot commands")

].map(x => x.toJSON());

bot.once("ready", async () => {

  console.log("================================");
  console.log(`✅ ${bot.user.tag} ONLINE`);
  console.log(`🧠 ${MODEL}`);
  console.log("================================");

  bot.user.setActivity(
    "Prime Development Studio",
    { type: 3 }
  );

  try {

    const rest = new REST({ version: "10" })
      .setToken(TOKEN);

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log(
      `✅ ${commands.length} commands registered`
    );

  } catch (e) {
    console.error("❌ Command Registration:", e);
  }
});

bot.on("interactionCreate", async i => {

  if (!i.isChatInputCommand()) return;

  const g = i.guild;
  const c = i.commandName;

  try {

    if (c === "ai") {

      await i.deferReply();

      const q =
        i.options.getString("question");

      const answer = await askAI(
        `You are Prime AI for Prime Development Studio.
Give helpful and clear answers.

User question:
${q}`
      );

      return i.editReply(
        answer.slice(0, 1900)
      );
    }

    if (c === "setaichannel") {

      aiChannels.set(
        g.id,
        i.channel.id
      );

      return i.reply(
        `✅ AI channel set: ${i.channel}`
      );
    }

    if (c === "removeaichannel") {

      aiChannels.delete(g.id);

      return i.reply(
        "✅ Automatic AI disabled."
      );
    }

    if (c === "setlogchannel") {

      logChannels.set(
        g.id,
        i.channel.id
      );

      return i.reply(
        `✅ Log channel set: ${i.channel}`
      );
    }

    if (c === "announce") {

      const msg =
        i.options.getString("message");

      return i.reply(
        `📢 **ANNOUNCEMENT**\n\n${msg}`
      );
    }

    if (c === "embedannounce") {

      const title =
        i.options.getString("title");

      const msg =
        i.options.getString("message");

      const embed = new EmbedBuilder()
        .setTitle(`📢 ${title}`)
        .setDescription(msg)
        .setFooter({
          text: "Prime Development Studio"
        })
        .setTimestamp();

      return i.reply({
        embeds: [embed]
      });
    }

    if (c === "warn") {

      const u =
        i.options.getUser("user");

      const r =
        i.options.getString("reason");

      const key =
        `${g.id}-${u.id}`;

      const list =
        warnings.get(key) || [];

      list.push(r);

      warnings.set(key, list);

      return i.reply(
        `⚠️ ${u} warned.\n**Reason:** ${r}`
      );
    }

    if (c === "warnings") {

      const u =
        i.options.getUser("user");

      const list =
        warnings.get(`${g.id}-${u.id}`) || [];

      if (!list.length)
        return i.reply(
          `✅ ${u} has no warnings.`
        );

      return i.reply(
        `⚠️ **Warnings for ${u}**\n` +
        list.map(
          (x,n) => `${n + 1}. ${x}`
        ).join("\n")
      );
    }

    if (c === "clear") {

      const n =
        i.options.getInteger("amount");

      await i.channel.bulkDelete(
        n,
        true
      );

      return i.reply({
        content:
          `🧹 Deleted ${n} messages.`,
        ephemeral: true
      });
    }

    if (c === "timeout") {

      const u =
        i.options.getUser("user");

      const m =
        i.options.getInteger("minutes");

      const member =
        await g.members.fetch(u.id);

      await member.timeout(
        m * 60000
      );

      return i.reply(
        `🔇 ${u} timed out for ${m} minutes.`
      );
    }

    if (c === "untimeout") {

      const u =
        i.options.getUser("user");

      const member =
        await g.members.fetch(u.id);

      await member.timeout(null);

      return i.reply(
        `🔊 Timeout removed from ${u}.`
      );
    }

    if (c === "kick") {

      const u =
        i.options.getUser("user");

      await g.members.kick(u.id);

      return i.reply(
        `👢 ${u.tag} kicked.`
      );
    }

    if (c === "ban") {

      const u =
        i.options.getUser("user");

      await g.members.ban(u.id);

      return i.reply(
        `🔨 ${u.tag} banned.`
      );
    }

    if (c === "unban") {

      const id =
        i.options.getString("userid");

      await g.members.unban(id);

      return i.reply(
        `✅ ${id} unbanned.`
      );
    }

    if (c === "lock") {

      await i.channel.permissionOverwrites.edit(
        g.roles.everyone,
        { SendMessages: false }
      );

      return i.reply(
        "🔒 Channel locked."
      );
    }

    if (c === "unlock") {

      await i.channel.permissionOverwrites.edit(
        g.roles.everyone,
        { SendMessages: null }
      );

      return i.reply(
        "🔓 Channel unlocked."
      );
    }

    if (c === "slowmode") {

      const s =
        i.options.getInteger("seconds");

      await i.channel.setRateLimitPerUser(s);

      return i.reply(
        `🐌 Slowmode set to ${s}s.`
      );
    }

    if (c === "serverinfo") {

      return i.reply(
        `📊 **${g.name}**\n` +
        `👥 Members: ${g.memberCount}\n` +
        `📁 Channels: ${g.channels.cache.size}\n` +
        `🎭 Roles: ${g.roles.cache.size}`
      );
    }

    if (c === "userinfo") {

      const u =
        i.options.getUser("user") ||
        i.user;

      return i.reply(
        `👤 **${u.tag}**\n` +
        `🆔 ${u.id}\n` +
        `🤖 Bot: ${u.bot}`
      );
    }

    if (c === "avatar") {

      const u =
        i.options.getUser("user") ||
        i.user;

      return i.reply(
        u.displayAvatarURL({
          size: 1024
        })
      );
    }

    if (c === "settings") {

      return i.reply(
        `⚙️ **Prime AI Settings**\n\n` +
        `🤖 AI: ${
          aiChannels.get(g.id)
          ? `<#${aiChannels.get(g.id)}>`
          : "Not Set"
        }\n` +
        `📋 Logs: ${
          logChannels.get(g.id)
          ? `<#${logChannels.get(g.id)}>`
          : "Not Set"
        }\n` +
        `🧠 Model: \`${MODEL}\``
      );
    }

    if (c === "help") {

      return i.reply(
        `🤖 **PRIME DEVELOPMENT AI**\n\n` +
        `🧠 **AI**\n` +
        `/ai\n/setaichannel\n/removeaichannel\n\n` +

        `📢 **Announcements**\n` +
        `/announce\n/embedannounce\n\n` +

        `🛡️ **Moderation**\n` +
        `/warn\n/warnings\n/clear\n/timeout\n/untimeout\n/kick\n/ban\n/unban\n\n` +

        `🔒 **Channel**\n` +
        `/lock\n/unlock\n/slowmode\n\n` +

        `📊 **Info**\n` +
        `/serverinfo\n/userinfo\n/avatar\n\n` +

        `⚙️ **System**\n` +
        `/setlogchannel\n/settings\n/help`
      );
    }

  } catch (e) {

    console.error(
      "❌ Interaction Error:",
      e
    );

    if (!i.replied && !i.deferred) {
      await i.reply(
        "❌ An error occurred."
      );
    }
  }
});

bot.on("messageCreate", async message => {

  if (message.author.bot) return;
  if (!message.guild) return;

  if (
    aiChannels.get(message.guild.id) !==
    message.channel.id
  ) return;

  const key =
    `${message.guild.id}-${message.author.id}`;

  const now = Date.now();

  if (
    now - (cooldown.get(key) || 0) < 5000
  ) return;

  cooldown.set(key, now);

  await message.channel.sendTyping();

  const answer = await askAI(
    `You are Prime AI in Prime Development Studio.

Answer naturally and helpfully.

User:
${message.author.username}

Message:
${message.content}`
  );

  for (
    let x = 0;
    x < answer.length;
    x += 1900
  ) {
    await message.channel.send(
      answer.slice(x, x + 1900)
    );
  }
});

const app = express();

app.get("/", (req, res) => {
  res.send(
    "🚀 Prime Development AI is Online!"
  );
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
  () => console.log(
    "🌐 Web server online"
  )
);

bot.login(TOKEN);
