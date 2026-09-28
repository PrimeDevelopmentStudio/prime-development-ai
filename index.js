require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");
const express = require("express");

// ================= CONFIG =================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MODEL = "gemini-3.8-flash";

if (!TOKEN) throw new Error("❌ DISCORD_TOKEN missing");
if (!CLIENT_ID) throw new Error("❌ CLIENT_ID missing");
if (!GEMINI_API_KEY) throw new Error("❌ GEMINI_API_KEY missing");

// ================= CLIENT =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

// ================= WEB SERVER =================

const app = express();

app.get("/", (req, res) => {
  res.send("Prime Development Studio AI is Online! 🚀");
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: client.user ? client.user.tag : "starting"
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web server started");
});

// ================= DATA =================

const aiChannels = new Map();
const welcomeChannels = new Map();
const antiLinkServers = new Set();

const levels = new Map();
const economy = new Map();
const giveaways = new Map();

// ================= HELPERS =================

function getKey(guildId, userId) {
  return `${guildId}-${userId}`;
}

function getEconomy(guildId, userId) {
  const key = getKey(guildId, userId);

  if (!economy.has(key)) {
    economy.set(key, {
      coins: 0,
      lastDaily: 0
    });
  }

  return economy.get(key);
}

function getLevel(guildId, userId) {
  const key = getKey(guildId, userId);

  if (!levels.has(key)) {
    levels.set(key, {
      xp: 0,
      level: 1
    });
  }

  return levels.get(key);
}

function xpRequired(level) {
  return level * 100;
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
}

// ================= GEMINI AI =================

async function askAI(question) {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: question
    });

    return response.text || "No response.";
  } catch (error) {
    console.error("GEMINI ERROR:");
    console.error(error);

    return "❌ Gemini AI error. Check Render Logs.";
  }
}

// ================= COMMANDS =================

const commands = [

  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Ask Prime Development Studio AI")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Ask anything")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setaichannel")
    .setDescription("Set this channel as AI channel"),

  new SlashCommandBuilder()
    .setName("removeaichannel")
    .setDescription("Remove AI channel"),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user information")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show user avatar")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send announcement")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Announcement")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create ticket panel"),

  new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set welcome channel"),

  new SlashCommandBuilder()
    .setName("removewelcome")
    .setDescription("Remove welcome system"),

  new SlashCommandBuilder()
    .setName("antilink")
    .setDescription("Enable or disable anti-link")
    .addStringOption(option =>
      option
        .setName("status")
        .setDescription("Status")
        .setRequired(true)
        .addChoices(
          { name: "ON", value: "on" },
          { name: "OFF", value: "off" }
        )
    ),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show rank")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show XP leaderboard"),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check balance")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim daily coins"),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Pay another user")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount")
        .setRequired(true)
        .setMinValue(1)
    ),

  // ADMIN CASH

  new SlashCommandBuilder()
    .setName("addcash")
    .setDescription("Admin: add cash")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("removecash")
    .setDescription("Admin: remove cash")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("setcash")
    .setDescription("Admin: set cash")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount")
        .setRequired(true)
        .setMinValue(0)
    ),

  // ADMIN XP

  new SlashCommandBuilder()
    .setName("addxp")
    .setDescription("Admin: add XP")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("XP amount")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("removexp")
    .setDescription("Admin: remove XP")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("XP amount")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("setxp")
    .setDescription("Admin: set XP")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("XP amount")
        .setRequired(true)
        .setMinValue(0)
    ),

  new SlashCommandBuilder()
    .setName("setlevel")
    .setDescription("Admin: set level")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("level")
        .setDescription("Level")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("reseteco")
    .setDescription("Admin: reset economy")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("resetlevel")
    .setDescription("Admin: reset level")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    ),

  // GIVEAWAY

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Create giveaway")
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Duration")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10080)
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("Prize")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all commands")

].map(command => command.toJSON());

// ================= REGISTER COMMANDS =================

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("🔄 Registering commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands
      }
    );

    console.log("✅ Commands registered!");
  } catch (error) {
    console.error("❌ Command registration error:");
    console.error(error);
  }
}

// ================= READY =================

client.once("ready", () => {

  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log("🚀 Prime Development Studio AI is ONLINE!");

  client.user.setActivity(
    "Prime Development Studio",
    {
      type: 3
    }
  );
});

// ================= INTERACTIONS =================

client.on("interactionCreate", async interaction => {

  // ================= BUTTONS =================

  if (interaction.isButton()) {

    // TICKET CREATE

    if (interaction.customId === "create_ticket") {

      const existing =
        interaction.guild.channels.cache.find(
          channel =>
            channel.name ===
            `ticket-${interaction.user.username.toLowerCase()}`
        );

      if (existing) {
        return interaction.reply({
          content:
            `❌ You already have a ticket: ${existing}`,
          ephemeral: true
        });
      }

      const ticketChannel =
        await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: ChannelType.GuildText,

          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [
                PermissionFlagsBits.ViewChannel
              ]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
              ]
            }
          ]
        });

      const closeButton =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Close Ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
        );

      await ticketChannel.send({
        content: `${interaction.user}`,

        embeds: [
          new EmbedBuilder()
            .setTitle("🎫 Support Ticket")
            .setDescription(
              "Welcome to your support ticket!\n\n" +
              "Please explain your issue clearly.\n" +
              "A staff member will assist you soon."
            )
            .setColor("Blue")
        ],

        components: [closeButton]
      });

      return interaction.reply({
        content:
          `✅ Ticket created: ${ticketChannel}`,
        ephemeral: true
      });
    }

    // TICKET CLOSE

    if (interaction.customId === "close_ticket") {

      await interaction.reply(
        "🔒 Closing ticket..."
      );

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 2000);

      return;
    }

    // GIVEAWAY ENTRY

    if (
      interaction.customId.startsWith("giveaway_")
    ) {

      const giveawayId =
        interaction.customId.replace(
          "giveaway_",
          ""
        );

      const giveaway =
        giveaways.get(giveawayId);

      if (!giveaway) {
        return interaction.reply({
          content:
            "❌ This giveaway has ended.",
          ephemeral: true
        });
      }

      if (
        giveaway.users.includes(
          interaction.user.id
        )
      ) {
        return interaction.reply({
          content:
            "❌ You already entered!",
          ephemeral: true
        });
      }

      giveaway.users.push(
        interaction.user.id
      );

      return interaction.reply({
        content:
          "🎉 You entered the giveaway!",
        ephemeral: true
      });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const command =
    interaction.commandName;

  // ================= AI =================

  if (command === "ai") {

    await interaction.deferReply();

    const question =
      interaction.options.getString(
        "question"
      );

    const answer =
      await askAI(question);

    return interaction.editReply({
      content: answer.slice(0, 2000)
    });
  }

  // ================= AI CHANNEL =================

  if (command === "setaichannel") {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    aiChannels.set(
      interaction.guild.id,
      interaction.channel.id
    );

    return interaction.reply(
      `✅ AI channel set to ${interaction.channel}`
    );
  }

  if (command === "removeaichannel") {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    aiChannels.delete(
      interaction.guild.id
    );

    return interaction.reply(
      "✅ AI channel removed."
    );
  }

  // ================= SERVER INFO =================

  if (command === "serverinfo") {

    const guild =
      interaction.guild;

    const embed =
      new EmbedBuilder()
        .setTitle(`📊 ${guild.name}`)
        .addFields(
          {
            name: "👑 Owner",
            value: `<@${guild.ownerId}>`,
            inline: true
          },
          {
            name: "👥 Members",
            value: `${guild.memberCount}`,
            inline: true
          },
          {
            name: "💬 Channels",
            value:
              `${guild.channels.cache.size}`,
            inline: true
          },
          {
            name: "🎭 Roles",
            value:
              `${guild.roles.cache.size}`,
            inline: true
          }
        )
        .setColor("Blue");

    return interaction.reply({
      embeds: [embed]
    });
  }

  // ================= USER INFO =================

  if (command === "userinfo") {

    const user =
      interaction.options.getUser("user") ||
      interaction.user;

    const member =
      interaction.guild.members.cache.get(
        user.id
      );

    const embed =
      new EmbedBuilder()
        .setTitle(`👤 ${user.username}`)
        .setThumbnail(
          user.displayAvatarURL()
        )
        .addFields(
          {
            name: "🆔 ID",
            value: user.id
          },
          {
            name: "📅 Account Created",
            value:
              `<t:${Math.floor(
                user.createdTimestamp / 1000
              )}:F>`
          },
          {
            name: "📥 Joined Server",
            value: member
              ? `<t:${Math.floor(
                  member.joinedTimestamp / 1000
                )}:F>`
              : "Unknown"
          }
        )
        .setColor("Blue");

    return interaction.reply({
      embeds: [embed]
    });
  }

  // ================= AVATAR =================

  if (command === "avatar") {

    const user =
      interaction.options.getUser("user") ||
      interaction.user;

    const embed =
      new EmbedBuilder()
        .setTitle(
          `🖼️ ${user.username}'s Avatar`
        )
        .setImage(
          user.displayAvatarURL({
            size: 1024
          })
        )
        .setColor("Blue");

    return interaction.reply({
      embeds: [embed]
    });
  }

  // ================= ANNOUNCE =================

  if (command === "announce") {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    const message =
      interaction.options.getString(
        "message"
      );

    const embed =
      new EmbedBuilder()
        .setTitle("📢 Announcement")
        .setDescription(message)
        .setFooter({
          text:
            `By ${interaction.user.username}`
        })
        .setTimestamp()
        .setColor("Blue");

    await interaction.reply({
      content:
        "✅ Announcement sent.",
      ephemeral: true
    });

    return interaction.channel.send({
      embeds: [embed]
    });
  }

  // ================= TICKET PANEL =================

  if (command === "ticket") {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("create_ticket")
          .setLabel("Create Ticket")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary)
      );

    const embed =
      new EmbedBuilder()
        .setTitle("🎫 Support Center")
        .setDescription(
          "Need help?\n\n" +
          "Click the button below to create a private support ticket."
        )
        .setColor("Blue");

    return interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }

  // ================= WELCOME =================

  if (command === "setwelcome") {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    welcomeChannels.set(
      interaction.guild.id,
      interaction.channel.id
    );

    return interaction.reply(
      `✅ Welcome channel set to ${interaction.channel}`
    );
  }

  if (command === "removewelcome") {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    welcomeChannels.delete(
      interaction.guild.id
    );

    return interaction.reply(
      "✅ Welcome system removed."
    );
  }

  // ================= ANTI LINK =================

  if (command === "antilink") {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    const status =
      interaction.options.getString(
        "status"
      );

    if (status === "on") {

      antiLinkServers.add(
        interaction.guild.id
      );

      return interaction.reply(
        "🛡️ Anti-Link enabled!"
      );
    }

    antiLinkServers.delete(
      interaction.guild.id
    );

    return interaction.reply(
      "🛡️ Anti-Link disabled!"
    );
  }

  // ================= RANK =================

  if (command === "rank") {

    const user =
      interaction.options.getUser("user") ||
      interaction.user;

    const data =
      getLevel(
        interaction.guild.id,
        user.id
      );

    const required =
      xpRequired(data.level);

    const embed =
      new EmbedBuilder()
        .setTitle(
          `🏆 ${user.username}'s Rank`
        )
        .setThumbnail(
          user.displayAvatarURL()
        )
        .addFields(
          {
            name: "⭐ Level",
            value: `${data.level}`,
            inline: true
          },
          {
            name: "✨ XP",
            value:
              `${data.xp}/${required}`,
            inline: true
          }
        )
        .setColor("Gold");

    return interaction.reply({
      embeds: [embed]
    });
  }

  // ================= LEADERBOARD =================

  if (command === "leaderboard") {

    const guildId =
      interaction.guild.id;

    const entries = [];

    for (const [key, data] of levels) {

      if (!key.startsWith(`${guildId}-`))
        continue;

      const userId =
        key.replace(`${guildId}-`, "");

      entries.push({
        userId,
        ...data
      });
    }

    entries.sort((a, b) => {

      if (b.level !== a.level) {
        return b.level - a.level;
      }

      return b.xp - a.xp;
    });

    const top =
      entries.slice(0, 10);

    if (!top.length) {
      return interaction.reply(
        "❌ No XP data available yet."
      );
    }

    let text = "";

    top.forEach((user, index) => {

      text +=
        `**${index + 1}.** <@${user.userId}> — ` +
        `Level ${user.level} | ${user.xp} XP\n`;
    });

    const embed =
      new EmbedBuilder()
        .setTitle("🏆 XP Leaderboard")
        .setDescription(text)
        .setColor("Gold");

    return interaction.reply({
      embeds: [embed]
    });
  }

  // ================= BALANCE =================

  if (command === "balance") {

    const user =
      interaction.options.getUser("user") ||
      interaction.user;

    const data =
      getEconomy(
        interaction.guild.id,
        user.id
      );

    return interaction.reply(
      `💰 **${user.username}** has **${data.coins.toLocaleString()} coins**.`
    );
  }

  // ================= DAILY =================

  if (command === "daily") {

    const data =
      getEconomy(
        interaction.guild.id,
        interaction.user.id
      );

    const now =
      Date.now();

    const cooldown =
      24 * 60 * 60 * 1000;

    if (
      now - data.lastDaily <
      cooldown
    ) {

      const remaining =
        cooldown -
        (now - data.lastDaily);

      const hours =
        Math.ceil(
          remaining /
          (60 * 60 * 1000)
        );

      return interaction.reply({
        content:
          `⏳ You already claimed your daily reward.\n` +
          `Try again in **${hours} hours**.`,
        ephemeral: true
      });
    }

    const reward = 1000;

    data.coins += reward;
    data.lastDaily = now;

    return interaction.reply(
      `🎁 Daily reward claimed!\n` +
      `💰 You received **${reward.toLocaleString()} coins**.`
    );
  }

  // ================= PAY =================

  if (command === "pay") {

    const target =
      interaction.options.getUser(
        "user"
      );

    const amount =
      interaction.options.getInteger(
        "amount"
      );

    if (
      target.id ===
      interaction.user.id
    ) {
      return interaction.reply({
        content:
          "❌ You cannot pay yourself.",
        ephemeral: true
      });
    }

    if (target.bot) {
      return interaction.reply({
        content:
          "❌ You cannot pay a bot.",
        ephemeral: true
      });
    }

    const sender =
      getEconomy(
        interaction.guild.id,
        interaction.user.id
      );

    const receiver =
      getEconomy(
        interaction.guild.id,
        target.id
      );

    if (sender.coins < amount) {
      return interaction.reply({
        content:
          "❌ You don't have enough coins.",
        ephemeral: true
      });
    }

    sender.coins -= amount;
    receiver.coins += amount;

    return interaction.reply(
      `💸 ${interaction.user} paid **${amount.toLocaleString()} coins** to ${target}.`
    );
  }

  // ================= ADMIN COMMANDS =================

  const adminCommands = [
    "addcash",
    "removecash",
    "setcash",
    "addxp",
    "removexp",
    "setxp",
    "setlevel",
    "reseteco",
    "resetlevel"
  ];

  if (
    adminCommands.includes(command)
  ) {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    const target =
      interaction.options.getUser(
        "user"
      );

    // ADD CASH

    if (command === "addcash") {

      const amount =
        interaction.options.getInteger(
          "amount"
        );

      const data =
        getEconomy(
          interaction.guild.id,
          target.id
        );

      data.coins += amount;

      return interaction.reply(
        `✅ Added **${amount.toLocaleString()} coins** to ${target}.`
      );
    }

    // REMOVE CASH

    if (command === "removecash") {

      const amount =
        interaction.options.getInteger(
          "amount"
        );

      const data =
        getEconomy(
          interaction.guild.id,
          target.id
        );

      data.coins =
        Math.max(
          0,
          data.coins - amount
        );

      return interaction.reply(
        `✅ Removed **${amount.toLocaleString()} coins** from ${target}.`
      );
    }

    // SET CASH

    if (command === "setcash") {

      const amount =
        interaction.options.getInteger(
          "amount"
        );

      const data =
        getEconomy(
          interaction.guild.id,
          target.id
        );

      data.coins = amount;

      return interaction.reply(
        `✅ ${target}'s cash set to **${amount.toLocaleString()} coins**.`
      );
    }

    // ADD XP

    if (command === "addxp") {

      const amount =
        interaction.options.getInteger(
          "amount"
        );

      const data =
        getLevel(
          interaction.guild.id,
          target.id
        );

      data.xp += amount;

      while (
        data.xp >=
        xpRequired(data.level)
      ) {

        data.xp -=
          xpRequired(data.level);

        data.level++;
      }

      return interaction.reply(
        `✅ Added **${amount.toLocaleString()} XP** to ${target}.\n` +
        `⭐ Current level: **${data.level}**`
      );
    }

    // REMOVE XP

    if (command === "removexp") {

      const amount =
        interaction.options.getInteger(
          "amount"
        );

      const data =
        getLevel(
          interaction.guild.id,
          target.id
        );

      let remaining = amount;

      while (
        remaining > 0 &&
        data.level > 1
      ) {

        if (
          data.xp >=
          remaining
        ) {

          data.xp -=
            remaining;

          remaining = 0;

        } else {

          remaining -=
            data.xp;

          data.level--;

          data.xp =
            xpRequired(data.level);
        }
      }

      if (remaining > 0) {

        data.xp =
          Math.max(
            0,
            data.xp - remaining
          );
      }

      return interaction.reply(
        `✅ Removed **${amount.toLocaleString()} XP** from ${target}.\n` +
        `⭐ Current level: **${data.level}**`
      );
    }

    // SET XP

    if (command === "setxp") {

      const amount =
        interaction.options.getInteger(
          "amount"
        );

      const data =
        getLevel(
          interaction.guild.id,
          target.id
        );

      data.xp = amount;

      while (
        data.xp >=
        xpRequired(data.level)
      ) {

        data.xp -=
          xpRequired(data.level);

        data.level++;
      }

      return interaction.reply(
        `✅ ${target}'s XP set to **${amount.toLocaleString()}**.\n` +
        `⭐ Level: **${data.level}**`
      );
    }

    // SET LEVEL

    if (command === "setlevel") {

      const level =
        interaction.options.getInteger(
          "level"
        );

      const data =
        getLevel(
          interaction.guild.id,
          target.id
        );

      data.level = level;
      data.xp = 0;

      return interaction.reply(
        `✅ ${target}'s level set to **${level}**.`
      );
    }

    // RESET ECONOMY

    if (command === "reseteco") {

      const data =
        getEconomy(
          interaction.guild.id,
          target.id
        );

      data.coins = 0;
      data.lastDaily = 0;

      return interaction.reply(
        `♻️ Economy reset for ${target}.`
      );
    }

    // RESET LEVEL

    if (command === "resetlevel") {

      const data =
        getLevel(
          interaction.guild.id,
          target.id
        );

      data.xp = 0;
      data.level = 1;

      return interaction.reply(
        `♻️ Level/XP reset for ${target}.`
      );
    }
  }

  // ================= GIVEAWAY =================

  if (command === "giveaway") {

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "❌ Administrator permission required.",
        ephemeral: true
      });
    }

    const minutes =
      interaction.options.getInteger(
        "minutes"
      );

    const prize =
      interaction.options.getString(
        "prize"
      );

    const giveawayId =
      `${interaction.guild.id}-${Date.now()}`;

    giveaways.set(
      giveawayId,
      {
        users: [],
        prize,
        channelId:
          interaction.channel.id
      }
    );

    const endTime =
      Date.now() +
      minutes * 60 * 1000;

    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `giveaway_${giveawayId}`
          )
          .setLabel(
            "Enter Giveaway"
          )
          .setEmoji("🎉")
          .setStyle(
            ButtonStyle.Success
          )
      );

    const embed =
      new EmbedBuilder()
        .setTitle("🎉 GIVEAWAY")
        .setDescription(
          `🎁 **Prize:** ${prize}\n\n` +
          `⏰ Ends: <t:${Math.floor(
            endTime / 1000
          )}:R>\n\n` +
          `Click below to enter!`
        )
        .setColor("Gold");

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });

    setTimeout(
      async () => {

        const giveaway =
          giveaways.get(
            giveawayId
          );

        if (!giveaway)
          return;

        giveaways.delete(
          giveawayId
        );

        const channel =
          interaction.guild.channels.cache.get(
            giveaway.channelId
          );

        if (!channel)
          return;

        if (
          !giveaway.users.length
        ) {

          return channel.send(
            "🎉 Giveaway ended, but nobody entered."
          );
        }

        const winnerId =
          giveaway.users[
            Math.floor(
              Math.random() *
              giveaway.users.length
            )
          ];

        await channel.send(
          `🎉 Congratulations <@${winnerId}>!\n` +
          `You won **${giveaway.prize}**!`
        );

      },
      minutes * 60 * 1000
    );

    return;
  }

  // ================= HELP =================

  if (command === "help") {

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🤖 Prime Development Studio AI"
        )
        .setDescription(
          "**🤖 AI**\n" +
          "`/ai` `/setaichannel` `/removeaichannel`\n\n" +

          "**📊 Server**\n" +
          "`/serverinfo` `/userinfo` `/avatar` `/announce`\n\n" +

          "**🎫 Support**\n" +
          "`/ticket`\n\n" +

          "**🛡️ Security**\n" +
          "`/antilink` `/setwelcome` `/removewelcome`\n\n" +

          "**🏆 Level**\n" +
          "`/rank` `/leaderboard`\n\n" +

          "**💰 Economy**\n" +
          "`/balance` `/daily` `/pay`\n\n" +

          "**👑 Admin Cash**\n" +
          "`/addcash` `/removecash` `/setcash`\n\n" +

          "**⭐ Admin XP**\n" +
          "`/addxp` `/removexp` `/setxp` `/setlevel`\n\n" +

          "**♻️ Reset**\n" +
          "`/reseteco` `/resetlevel`\n\n" +

          "**🎉 Giveaway**\n" +
          "`/giveaway`"
        )
        .setFooter({
          text:
            "Prime Development Studio AI"
        })
        .setColor("Blue");

    return interaction.reply({
      embeds: [embed]
    });
  }
});

// ================= WELCOME EVENT =================

client.on(
  "guildMemberAdd",
  async member => {

    const channelId =
      welcomeChannels.get(
        member.guild.id
      );

    if (!channelId)
      return;

    const channel =
      member.guild.channels.cache.get(
        channelId
      );

    if (!channel)
      return;

    const embed =
      new EmbedBuilder()
        .setTitle("👋 Welcome!")
        .setDescription(
          `Welcome ${member} to **${member.guild.name}**!\n\n` +
          `We hope you enjoy your stay! 🚀`
        )
        .setThumbnail(
          member.user.displayAvatarURL()
        )
        .setColor("Green")
        .setTimestamp();

    channel.send({
      embeds: [embed]
    }).catch(() => {});
  }
);

// ================= MESSAGE EVENT =================

client.on(
  "messageCreate",
  async message => {

    if (message.author.bot)
      return;

    // ANTI LINK

    if (
      message.guild &&
      antiLinkServers.has(
        message.guild.id
      ) &&
      /(https?:\/\/|www\.|discord\.gg\/)/i.test(
        message.content
      )
    ) {

      if (
        !message.member?.permissions.has(
          PermissionFlagsBits.Administrator
        )
      ) {

        await message.delete()
          .catch(() => {});

        const warning =
          await message.channel.send(
            `${message.author} ❌ Links are not allowed here.`
          );

        setTimeout(() => {
          warning.delete()
            .catch(() => {});
        }, 5000);

        return;
      }
    }

    // XP

    if (message.guild) {

      const data =
        getLevel(
          message.guild.id,
          message.author.id
        );

      data.xp += 10;

      while (
        data.xp >=
        xpRequired(data.level)
      ) {

        data.xp -=
          xpRequired(data.level);

        data.level++;

        message.channel.send(
          `🎉 Congratulations ${message.author}! You reached **Level ${data.level}**!`
        ).catch(() => {});
      }
    }

    // AI CHANNEL

    if (
      message.guild &&
      aiChannels.get(
        message.guild.id
      ) === message.channel.id
    ) {

      const answer =
        await askAI(
          message.content
        );

      await message.reply({
        content:
          answer.slice(0, 2000)
      }).catch(() => {});
    }
  }
);

// ================= START =================

async function startBot() {

  await registerCommands();

  await client.login(TOKEN);
}

startBot().catch(error => {

  console.error(
    "❌ BOT START ERROR:"
  );

  console.error(error);
});
