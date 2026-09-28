const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!TOKEN || !CLIENT_ID || !GEMINI_KEY) {
  console.error("Missing environment variables!");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

const client = new Client({
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
    .setDescription("Set the automatic AI channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("AI channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

  new SlashCommandBuilder()
    .setName("removeaichannel")
    .setDescription("Remove automatic AI channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption(o =>
      o.setName("user").setDescription("Member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString()),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View member warnings")
    .addUserOption(o =>
      o.setName("user").setDescription("Member").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString()),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("1-100 messages")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString()),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .addUserOption(o =>
      o.setName("user").setDescription("Member").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("Timeout duration")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString()),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout")
    .addUserOption(o =>
      o.setName("user").setDescription("Member").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString()),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .addUserOption(o =>
      o.setName("user").setDescription("Member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers.toString()),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption(o =>
      o.setName("user").setDescription("Member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers.toString()),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption(o =>
      o.setName("userid").setDescription("User ID").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers.toString()),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString()),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString()),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .addIntegerOption(o =>
      o.setName("seconds")
        .setDescription("0-21600 seconds")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString()),

  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set moderation log channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Log channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user information")
    .addUserOption(o =>
      o.setName("user").setDescription("User")
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show avatar")
    .addUserOption(o =>
      o.setName("user").setDescription("User")
    ),

  new SlashCommandBuilder()
    .setName("channelinfo")
    .setDescription("Show channel information"),
