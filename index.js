require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");
const express = require("express");

// ================= CONFIG =================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// You can change this from Render Environment Variables
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!TOKEN || !CLIENT_ID || !GEMINI_KEY) {
  console.error("❌ Missing environment variables!");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_KEY,
});

// ================= DISCORD =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ================= DATA =================

const aiChannels = new Map();
const logChannels = new Map();
const warnings = new Map();
const cooldowns = new Map();

// ================= AI =================

async function askAI(prompt) {
  const maxRetries = 4;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🤖 Gemini request | Model: ${GEMINI_MODEL} | Attempt: ${attempt}`
      );

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });

      const text = response.text;

      if (text && text.trim()) {
        console.log("✅ Gemini response received");
        return text.trim();
      }

      return "⚠️ AI returned an empty response.";

    } catch (error) {
      const message = String(error?.message || error);

      console.error(`❌ Gemini attempt ${attempt}: ${message}`);

      const temporary =
        message.includes("503") ||
        message.includes("UNAVAILABLE") ||
        message.includes("429") ||
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("high demand");

      if (!temporary || attempt === maxRetries) {
        return `⚠️ AI error: ${message.slice(0, 500)}`;
      }

      // Exponential retry: 2s, 4s, 8s...
      const wait = 2000 * Math.pow(2, attempt - 1);

      console.log(`⏳ Gemini busy. Retrying in ${wait / 1000}s...`);

      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }

  return "⚠️ Gemini is temporarily unavailable. Please try again.";
}

// ================= LOGGING =================

async function sendLog(guild, text) {
  const channelId = logChannels.get(guild.id);

  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);

  if (!channel) return;

  try {
    await channel.send(text);
  } catch {}
}

// ================= COMMANDS =================

const commands = [

  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Ask Prime AI")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setaichannel")
    .setDescription("Set the AI channel"),

  new SlashCommandBuilder()
    .setName("removeaichannel")
    .setDescription("Remove the AI channel"),

  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set the moderation log channel"),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View member warnings")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("1-100")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Timeout minutes")
        .setMinValue(1)
        .setMaxValue(10080)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption(option =>
      option
        .setName("userid")
        .setDescription("User ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock current channel"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock current channel"),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .addIntegerOption(option =>
      option
        .setName("seconds")
        .setDescription("0-21600 seconds")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user information")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show avatar")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("channelinfo")
    .setDescription("Show channel information"),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Show bot settings"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show bot commands"),

].map(command => command.toJSON());

// ================= READY =================

client.once("ready", async () => {

  console.log("=================================");
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log(`🤖 Gemini Model: ${GEMINI_MODEL}`);
  console.log("=================================");

  client.user.setActivity("Prime Development Studio", {
    type: 3,
  });

  try {

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands,
      }
    );

    console.log("✅ Slash commands registered");

  } catch (error) {
    console.error("❌ Command registration error:", error);
  }
});

// ================= INTERACTIONS =================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;

  try {

    // ---------- AI ----------

    if (command === "ai") {

      const question =
        interaction.options.getString("question");

      await interaction.deferReply();

      const answer = await askAI(
        `You are Prime AI, the official AI assistant of Prime Development Studio.

Be helpful, friendly and concise.
Answer in the same language/style as the user.
If the user uses Hinglish, reply in Hinglish.

User question:
${question}`
      );

      return interaction.editReply(answer.slice(0, 4000));
    }

    // ---------- SET AI CHANNEL ----------

    if (command === "setaichannel") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ManageGuild
        )
      ) {
        return interaction.reply({
          content: "❌ You need Manage Server permission.",
          ephemeral: true,
        });
      }

      aiChannels.set(
        interaction.guild.id,
        interaction.channel.id
      );

      return interaction.reply(
        `✅ AI channel set to <#${interaction.channel.id}>`
      );
    }

    // ---------- REMOVE AI CHANNEL ----------

    if (command === "removeaichannel") {

      aiChannels.delete(interaction.guild.id);

      return interaction.reply(
        "✅ AI channel removed."
      );
    }

    // ---------- LOG CHANNEL ----------

    if (command === "setlogchannel") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ManageGuild
        )
      ) {
        return interaction.reply({
          content: "❌ You need Manage Server permission.",
          ephemeral: true,
        });
      }

      logChannels.set(
        interaction.guild.id,
        interaction.channel.id
      );

      return interaction.reply(
        `✅ Log channel set to <#${interaction.channel.id}>`
      );
    }

    // ---------- WARN ----------

    if (command === "warn") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      ) {
        return interaction.reply({
          content: "❌ You need Moderate Members permission.",
          ephemeral: true,
        });
      }

      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString("reason");

      const key =
        `${interaction.guild.id}-${user.id}`;

      const current =
        warnings.get(key) || [];

      current.push({
        reason,
        moderator: interaction.user.id,
        time: new Date().toISOString(),
      });

      warnings.set(key, current);

      await sendLog(
        interaction.guild,
        `⚠️ **Warning**\nUser: ${user}\nModerator: ${interaction.user}\nReason: ${reason}`
      );

      return interaction.reply(
        `⚠️ ${user} has been warned.\nReason: ${reason}`
      );
    }

    // ---------- WARNINGS ----------

    if (command === "warnings") {

      const user =
        interaction.options.getUser("user");

      const key =
        `${interaction.guild.id}-${user.id}`;

      const list =
        warnings.get(key) || [];

      if (!list.length) {
        return interaction.reply(
          `✅ ${user} has no warnings.`
        );
      }

      const text = list
        .map(
          (w, i) =>
            `**${i + 1}.** ${w.reason}`
        )
        .join("\n");

      return interaction.reply(
        `⚠️ Warnings for ${user}:\n${text}`
      );
    }

    // ---------- CLEAR ----------

    if (command === "clear") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {
        return interaction.reply({
          content: "❌ You need Manage Messages permission.",
          ephemeral: true,
        });
      }

      const amount =
        interaction.options.getInteger("amount");

      await interaction.channel.bulkDelete(
        amount,
        true
      );

      return interaction.reply({
        content: `🧹 Deleted ${amount} messages.`,
        ephemeral: true,
      });
    }

    // ---------- TIMEOUT ----------

    if (command === "timeout") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      ) {
        return interaction.reply({
          content: "❌ You need Moderate Members permission.",
          ephemeral: true,
        });
      }

      const user =
        interaction.options.getUser("user");

      const minutes =
        interaction.options.getInteger("minutes");

      const member =
        await interaction.guild.members.fetch(user.id);

      await member.timeout(
        minutes * 60 * 1000,
        `Timeout by ${interaction.user.tag}`
      );

      await sendLog(
        interaction.guild,
        `🔇 ${user} was timed out for ${minutes} minutes by ${interaction.user}.`
      );

      return interaction.reply(
        `🔇 ${user} timed out for ${minutes} minutes.`
      );
    }

    // ---------- UNTIMEOUT ----------

    if (command === "untimeout") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      ) {
        return interaction.reply({
          content: "❌ You need Moderate Members permission.",
          ephemeral: true,
        });
      }

      const user =
        interaction.options.getUser("user");

      const member =
        await interaction.guild.members.fetch(user.id);

      await member.timeout(null);

      return interaction.reply(
        `🔊 Timeout removed from ${user}.`
      );
    }

    // ---------- KICK ----------

    if (command === "kick") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.KickMembers
        )
      ) {
        return interaction.reply({
          content: "❌ You need Kick Members permission.",
          ephemeral: true,
        });
      }

      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided";

      const member =
        await interaction.guild.members.fetch(user.id);

      await member.kick(reason);

      await sendLog(
        interaction.guild,
        `👢 ${user.tag} was kicked by ${interaction.user.tag}\nReason: ${reason}`
      );

      return interaction.reply(
        `👢 ${user.tag} has been kicked.`
      );
    }

    // ---------- BAN ----------

    if (command === "ban") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.BanMembers
        )
      ) {
        return interaction.reply({
          content: "❌ You need Ban Members permission.",
          ephemeral: true,
        });
      }

      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided";

      const member =
        await interaction.guild.members.fetch(user.id);

      await member.ban({
        reason,
      });

      await sendLog(
        interaction.guild,
        `🔨 ${user.tag} was banned by ${interaction.user.tag}\nReason: ${reason}`
      );

      return interaction.reply(
        `🔨 ${user.tag} has been banned.`
      );
    }

    // ---------- UNBAN ----------

    if (command === "unban") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.BanMembers
        )
      ) {
        return interaction.reply({
          content: "❌ You need Ban Members permission.",
          ephemeral: true,
        });
      }

      const userId =
        interaction.options.getString("userid");

      await interaction.guild.members.unban(userId);

      return interaction.reply(
        `✅ User \`${userId}\` has been unbanned.`
      );
    }

    // ---------- LOCK ----------

    if (command === "lock") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ManageChannels
        )
      ) {
        return interaction.reply({
          content: "❌ You need Manage Channels permission.",
          ephemeral: true,
        });
      }

      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: false,
        }
      );

      return interaction.reply(
        "🔒 Channel locked."
      );
    }

    // ---------- UNLOCK ----------

    if (command === "unlock") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ManageChannels
        )
      ) {
        return interaction.reply({
          content: "❌ You need Manage Channels permission.",
          ephemeral: true,
        });
      }

      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: null,
        }
      );

      return interaction.reply(
        "🔓 Channel unlocked."
      );
    }

    // ---------- SLOWMODE ----------

    if (command === "slowmode") {

      if (
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.ManageChannels
        )
      ) {
        return interaction.reply({
          content: "❌ You need Manage Channels permission.",
          ephemeral: true,
        });
      }

      const seconds =
        interaction.options.getInteger("seconds");

      await interaction.channel.setRateLimitPerUser(
        seconds
      );

      return interaction.reply(
        `🐌 Slowmode set to ${seconds} seconds.`
      );
    }

    // ---------- SERVER INFO ----------

    if (command === "serverinfo") {

      const guild = interaction.guild;

      return interaction.reply(
        `🏠 **${guild.name}**\n\n` +
        `👥 Members: ${guild.memberCount}\n` +
        `💬 Channels: ${guild.channels.cache.size}\n` +
        `🆔 ID: ${guild.id}\n` +
        `👑 Owner: <@${guild.ownerId}>`
      );
    }

    // ---------- USER INFO ----------

    if (command === "userinfo") {

      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      const member =
        await interaction.guild.members.fetch(user.id);

      return interaction.reply(
        `👤 **User Information**\n\n` +
        `Name: ${user.tag}\n` +
        `ID: ${user.id}\n` +
        `Joined: <t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n` +
        `Created: <t:${Math.floor(user.createdTimestamp / 1000)}:F>`
      );
    }

    // ---------- AVATAR ----------

    if (command === "avatar") {

      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      return interaction.reply(
        `🖼️ **${user.tag}'s Avatar**\n${user.displayAvatarURL({
          size: 1024,
          extension: "png",
        })}`
      );
    }

    // ---------- CHANNEL INFO ----------

    if (command === "channelinfo") {

      const channel = interaction.channel;

      return interaction.reply(
        `📺 **Channel Information**\n\n` +
        `Name: ${channel.name}\n` +
        `ID: ${channel.id}\n` +
        `Type: ${channel.type}\n` +
        `Created: <t:${Math.floor(channel.createdTimestamp / 1000)}:F>`
      );
    }

    // ---------- SETTINGS ----------

    if (command === "settings") {

      const aiChannel =
        aiChannels.get(interaction.guild.id);

      const logChannel =
        logChannels.get(interaction.guild.id);

      return interaction.reply(
        `⚙️ **Prime AI Settings**\n\n` +
        `🤖 AI Channel: ${
          aiChannel
            ? `<#${aiChannel}>`
            : "Not configured"
        }\n` +
        `📋 Log Channel: ${
          logChannel
            ? `<#${logChannel}>`
            : "Not configured"
        }\n` +
        `🧠 Gemini Model: \`${GEMINI_MODEL}\``
  
