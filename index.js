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

// ===============================
// SETTINGS
// ===============================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MODEL = "gemini-3.8-flash";

// ===============================
// CHECK ENV
// ===============================

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN missing");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID missing");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing");
  process.exit(1);
}

// ===============================
// GEMINI
// ===============================

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

// ===============================
// DISCORD
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ===============================
// DATA
// ===============================

const aiChannels = new Map();

const welcomeChannels = new Map();

const antiLinkServers = new Set();

const levels = new Map();

const economy = new Map();

const giveaways = new Map();

// ===============================
// GEMINI FUNCTION
// ===============================

async function askAI(question) {

  try {

    const response =
      await ai.models.generateContent({
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

// ===============================
// LEVEL SYSTEM
// ===============================

function getLevelData(guildId, userId) {

  const key =
    `${guildId}-${userId}`;

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

// ===============================
// ECONOMY SYSTEM
// ===============================

function getEconomy(guildId, userId) {

  const key =
    `${guildId}-${userId}`;

  if (!economy.has(key)) {

    economy.set(key, {
      coins: 0,
      lastDaily: 0
    });

  }

  return economy.get(key);

}

// ===============================
// COMMANDS
// ===============================

const commands = [

  // =============================
  // AI
  // =============================

  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Ask Prime Development AI")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setaichannel")
    .setDescription("Set this channel as AI channel"),

  new SlashCommandBuilder()
    .setName("removeaichannel")
    .setDescription("Remove AI channel"),

  // =============================
  // SERVER INFO
  // =============================

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
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show avatar")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
    ),

  // =============================
  // ANNOUNCEMENT
  // =============================

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Create announcement")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Announcement message")
        .setRequired(true)
    ),

  // =============================
  // TICKET
  // =============================

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create a ticket panel"),

  // =============================
  // WELCOME
  // =============================

  new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set current channel as welcome channel"),

  new SlashCommandBuilder()
    .setName("removewelcome")
    .setDescription("Remove welcome channel"),

  // =============================
  // ANTI LINK
  // =============================

  new SlashCommandBuilder()
    .setName("antilink")
    .setDescription("Enable or disable anti-link")
    .addStringOption(option =>
      option
        .setName("status")
        .setDescription("Enable or disable")
        .setRequired(true)
        .addChoices(
          {
            name: "Enable",
            value: "on"
          },
          {
            name: "Disable",
            value: "off"
          }
        )
    ),

  // =============================
  // LEVEL
  // =============================

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your level")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show XP leaderboard"),

  // =============================
  // ECONOMY
  // =============================

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your balance")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
    ),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Collect daily coins"),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Pay another member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount")
        .setMinValue(1)
        .setRequired(true)
    ),

  // =============================
  // GIVEAWAY
  // =============================

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Start a giveaway")
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Giveaway duration")
        .setMinValue(1)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("Giveaway prize")
        .setRequired(true)
    ),

  // =============================
  // HELP
  // =============================

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show bot commands")

].map(command => command.toJSON());

// ===============================
// BOT READY
// ===============================

client.once("ready", async () => {

  console.log("");
  console.log("================================");
  console.log("🚀 PRIME DEVELOPMENT STUDIO AI");
  console.log("================================");
  console.log(`✅ Bot: ${client.user.tag}`);
  console.log(`🧠 Model: ${MODEL}`);
  console.log("🎫 Tickets: ON");
  console.log("🎁 Giveaways: ON");
  console.log("👋 Welcome: ON");
  console.log("⭐ Levels: ON");
  console.log("💰 Economy: ON");
  console.log("🔗 Anti-Link: ON");
  console.log("================================");

  client.user.setActivity(
    "Prime Development Studio",
    {
      type: 3
    }
  );

  try {

    const rest = new REST({
      version: "10"
    }).setToken(TOKEN);

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands
      }
    );

    console.log(
      `✅ ${commands.length} commands registered`
    );

  } catch (error) {

    console.error(
      "❌ Slash command error:",
      error
    );

  }

});

// ===============================
// WELCOME
// ===============================

client.on(
  "guildMemberAdd",
  async member => {

    const channelId =
      welcomeChannels.get(
        member.guild.id
      );

    if (!channelId) return;

    const channel =
      member.guild.channels.cache.get(
        channelId
      );

    if (!channel) return;

    const embed =
      new EmbedBuilder()
        .setTitle("👋 Welcome!")
        .setDescription(
          `Welcome ${member} to **${member.guild.name}**!\n\n` +
          `🎉 We are happy to have you here.\n` +
          `📖 Please check the server rules.`
        )
        .setThumbnail(
          member.user.displayAvatarURL({
            size: 1024
          })
        )
        .setFooter({
          text: "Prime Development Studio"
        })
        .setTimestamp();

    try {

      await channel.send({
        content: `${member}`,
        embeds: [embed]
      });

    } catch (error) {

      console.error(
        "WELCOME ERROR:",
        error
      );

    }

  }
);

// ===============================
// SLASH COMMANDS
// ===============================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isChatInputCommand())
      return;

    try {

      // =========================
      // AI
      // =========================

      if (
        interaction.commandName === "ai"
      ) {

        await interaction.deferReply();

        const question =
          interaction.options.getString(
            "question"
          );

        const prompt = `
You are Prime Development Studio AI.

You are a friendly Discord AI assistant.

Help users with:
- Discord
- Bots
- Coding
- Websites
- Games
- Development
- General questions

Give clear and useful answers.

User:
${question}
`;

        const answer =
          await askAI(prompt);

        return interaction.editReply(
          answer.substring(0, 1900)
        );
      }

      // =========================
      // SET AI CHANNEL
      // =========================

      if (
        interaction.commandName ===
        "setaichannel"
      ) {

        aiChannels.set(
          interaction.guild.id,
          interaction.channel.id
        );

        return interaction.reply(
          `✅ AI channel set to ${interaction.channel}`
        );
      }

      // =========================
      // REMOVE AI CHANNEL
      // =========================

      if (
        interaction.commandName ===
        "removeaichannel"
      ) {

        aiChannels.delete(
          interaction.guild.id
        );

        return interaction.reply(
          "✅ Automatic AI disabled."
        );
      }

      // =========================
      // SERVER INFO
      // =========================

      if (
        interaction.commandName ===
        "serverinfo"
      ) {

        const guild =
          interaction.guild;

        return interaction.reply(
          `📊 **${guild.name}**\n\n` +
          `👥 Members: ${guild.memberCount}\n` +
          `📁 Channels: ${guild.channels.cache.size}\n` +
          `🎭 Roles: ${guild.roles.cache.size}\n` +
          `🆔 ID: ${guild.id}`
        );
      }

      // =========================
      // USER INFO
      // =========================

      if (
        interaction.commandName ===
        "userinfo"
      ) {

        const user =
          interaction.options.getUser(
            "user"
          ) || interaction.user;

        return interaction.reply(
          `👤 **${user.tag}**\n\n` +
          `🆔 ${user.id}\n` +
          `🤖 Bot: ${user.bot ? "Yes" : "No"}`
        );
      }

      // =========================
      // AVATAR
      // =========================

      if (
        interaction.commandName ===
        "avatar"
      ) {

        const user =
          interaction.options.getUser(
            "user"
          ) || interaction.user;

        return interaction.reply(
          user.displayAvatarURL({
            size: 1024
          })
        );
      }

      // =========================
      // ANNOUNCE
      // =========================

      if (
        interaction.commandName ===
        "announce"
      ) {

        const message =
          interaction.options.getString(
            "message"
          );

        return interaction.reply(
          `📢 **PRIME DEVELOPMENT STUDIO**\n\n${message}`
        );
      }

      // =========================
      // TICKET PANEL
      // =========================

      if (
        interaction.commandName ===
        "ticket"
      ) {

        const embed =
          new EmbedBuilder()
            .setTitle("🎫 Prime Support")
            .setDescription(
              "Need help? Click the button below to create a private support ticket."
            )
            .setFooter({
              text: "Prime Development Studio"
            });

        const row =
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId("create_ticket")
                .setLabel("Create Ticket")
                .setEmoji("🎫")
                .setStyle(
                  ButtonStyle.Primary
                )
            );

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

      // =========================
      // SET WELCOME
      // =========================

      if (
        interaction.commandName ===
        "setwelcome"
      ) {

        welcomeChannels.set(
          interaction.guild.id,
          interaction.channel.id
        );

        return interaction.reply(
          `👋 Welcome channel set to ${interaction.channel}`
        );
      }

      // =========================
      // REMOVE WELCOME
      // =========================

      if (
        interaction.commandName ===
        "removewelcome"
      ) {

        welcomeChannels.delete(
          interaction.guild.id
        );

        return interaction.reply(
          "✅ Welcome system disabled."
        );
      }

      // =========================
      // ANTILINK
      // =========================

      if (
        interaction.commandName ===
        "antilink"
      ) {

        const status =
          interaction.options.getString(
            "status"
          );

        if (status === "on") {

          antiLinkServers.add(
            interaction.guild.id
          );

          return interaction.reply(
            "🔗 **Anti-Link enabled.**\nDiscord invites and common links will be removed."
          );

        }

        antiLinkServers.delete(
          interaction.guild.id
        );

        return interaction.reply(
          "🔗 **Anti-Link disabled.**"
        );
      }

      // =========================
      // RANK
      // =========================

      if (
        interaction.commandName ===
        "rank"
      ) {

        const user =
          interaction.options.getUser(
            "user"
          ) || interaction.user;

        const data =
          getLevelData(
            interaction.guild.id,
            user.id
          );

        const required =
          xpRequired(data.level);

        return interaction.reply(
          `⭐ **${user.username}'s Rank**\n\n` +
          `🏆 Level: **${data.level}**\n` +
          `✨ XP: **${data.xp}/${required}**`
        );
      }

      // =========================
      // LEADERBOARD
      // =========================

      if (
        interaction.commandName ===
        "leaderboard"
      ) {

        const prefix =
          `${interaction.guild.id}-`;

        const users = [];

        for (
          const [key, data]
          of levels.entries()
        ) {

          if (!key.startsWith(prefix))
            continue;

          const userId =
            key.replace(prefix, "");

          users.push({
            userId,
            level: data.level,
            xp: data.xp
          });

        }

        users.sort(
          (a, b) =>
            (b.level * 100 + b.xp) -
            (a.level * 100 + a.xp)
        );

        const top =
          users.slice(0, 10);

        if (!top.length) {

          return interaction.reply(
            "⭐ No XP data yet."
          );

        }

        let text =
          "🏆 **XP LEADERBOARD**\n\n";

        for (
          let i = 0;
          i < top.length;
          i++
        ) {

          text +=
            `**${i + 1}.** <@${top[i].userId}> — Level ${top[i].level} (${top[i].xp} XP)\n`;

        }

        return interaction.reply(text);
      }

      // =========================
      // BALANCE
      // =========================

      if (
        interaction.commandName ===
        "balance"
      ) {

        const user =
          interaction.options.getUser(
            "user"
          ) || interaction.user;

        const data =
          getEconomy(
            interaction.guild.id,
            user.id
          );

        return interaction.reply(
          `💰 **${user.username}**\n\n` +
          `🪙 Coins: **${data.coins}**`
        );
      }

      // =========================
      // DAILY
      // =========================

      if (
        interaction.commandName ===
        "daily"
      ) {

        const data =
          getEconomy(
            interaction.guild.id,
            interaction.user.id
          );

        const now =
          Date.now();

        const oneDay =
          24 * 60 * 60 * 1000;

        if (
          now - data.lastDaily <
          oneDay
        ) {

          const remaining =
            oneDay -
            (now - data.lastDaily);

          const hours =
            Math.ceil(
              remaining /
              (60 * 60 * 1000)
            );

          return interaction.reply(
            `⏰ Daily already claimed. Try again in **${hours}h**.`
          );
        }

        const reward =
          500;

        data.coins += reward;
        data.lastDaily = now;

        return interaction.reply(
          `🎁 Daily reward collected!\n\n` +
          `🪙 You received **${reward} coins**.\n` +
          `💰 Balance: **${data.coins}**`
        );
      }

      // =========================
      // PAY
      // =========================

      if (
        interaction.commandName ===
        "pay"
      ) {

        const receiver =
          interaction.options.getUser(
            "user"
          );

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        if (
          receiver.id ===
          interaction.user.id
        ) {

          return interaction.reply(
            "❌ You cannot pay yourself."
          );
        }

        if (receiver.bot) {

          return interaction.reply(
            "❌ You cannot pay a bot."
          );
        }

        const senderData =
          getEconomy(
            interaction.guild.id,
            interaction.user.id
          );

        if (
          senderData.coins <
          amount
        ) {

          return interaction.reply(
            "❌ You don't have enough coins."
          );
        }

        const receiverData =
          getEconomy(
            interaction.guild.id,
            receiver.id
          );

        senderData.coins -= amount;
        receiverData.coins += amount;

        return interaction.reply(
          `💸 ${interaction.user} paid **${amount} coins** to ${receiver}.`
        );
    

      // =========================
      // GIVEAWAY
      // =========================

      if (
        interaction.commandName ===
        "giveaway"
      ) {

        const minutes =
          interaction.options.getInteger(
            "minutes"
          );

        const prize =
          interaction.options.getString(
            "prize"
          );

        const endTime =
          Date.now() +
          minutes * 60 * 1000;

        const giveawayId =
          `${interaction.guild.id}-${Date.now()}`;

        const giveaway = {
          id: giveawayId,
          prize,
          channelId:
            interaction.channel.id,
          messageId: null,
          participants: new Set(),
          endTime
        };

        const embed =
          new EmbedBuilder()
            .setTitle("🎁 GIVEAWAY")
            .setDescription(
              `🎉 **Prize:** ${prize}\n\n` +
              `⏰ **Duration:** ${minutes} minute(s)\n\n` +
              `👥 Click **Enter Giveaway** to participate!\n\n` +
              `🏆 Winner will be selected automatically.`
            )
            .setFooter({
              text:
                "Prime Development Studio Giveaways"
            })
            .setTimestamp(endTime);

        const row =
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `giveaway_enter_${giveawayId}`
                )
                .setLabel("Enter Giveaway")
                .setEmoji("🎉")
                .setStyle(
                  ButtonStyle.Success
                )
            );

        const msg =
          await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
          });

        giveaway.messageId =
          msg.id;

        giveaways.set(
          giveawayId,
          giveaway
        );

        setTimeout(
          async () => {

            const current =
              giveaways.get(
                giveawayId
              );

            if (!current)
              return;

            const participants =
              Array.from(
                current.participants
              );

            const channel =
              interaction.guild.channels.cache.get(
                current.channelId
              );

            if (!channel) return;

            if (!participants.length) {

              await channel.send(
                `🎁 Giveaway ended!\n\n` +
                `Prize: **${current.prize}**\n` +
                `❌ No participants.`
              );

              giveaways.delete(
                giveawayId
              );

              return;
            }

            const winner =
              participants[
                Math.floor(
                  Math.random() *
                  participants.length
                )
              ];

            await channel.send(
              `🎉 **GIVEAWAY WINNER!**\n\n` +
              `🏆 Prize: **${current.prize}**\n` +
              `👑 Winner: <@${winner}>`
            );

            giveaways.delete(
              giveawayId
            );

          },
          minutes * 60 * 1000
        );

        return;
      }

      // =========================
      // HELP
      // =========================

      if (
        interaction.commandName ===
        "help"
      ) {

        return interaction.reply(
          `🤖 **PRIME DEVELOPMENT STUDIO AI**\n\n` +

          `🧠 **AI**\n` +
          `/ai\n` +
          `/setaichannel\n` +
          `/removeaichannel\n\n` +

          `🎫 **Tickets**\n` +
          `/ticket\n\n` +

          `🎁 **Giveaways**\n` +
          `/giveaway\n\n` +

          `👋 **Welcome**\n` +
          `/setwelcome\n` +
          `/removewelcome\n\n` +

          `🔗 **Security**\n` +
          `/antilink\n\n` +

          `⭐ **Levels**\n` +
          `/rank\n` +
          `/leaderboard\n\n` +

          `💰 **Economy**\n` +
          `/balance\n` +
          `/daily\n` +
          `/pay\n\n` +

          `📢 **Announcements**\n` +
          `/announce\n\n` +

          `📊 **Information**\n` +
          `/serverinfo\n` +
          `/userinfo\n` +
          `/avatar`
        );
      }

    } catch (error) {

      console.error(
        "COMMAND ERROR:",
        error
      );

      if (
        interaction.deferred
      ) {

        return interaction.editReply(
          "❌ Command error."
        );

      }

      if (
        !interaction.replied
      ) {

        return interaction.reply({
          content:
            "❌ Command error.",
          ephemeral: true
        });

      }

    }

  }
);

// ===============================
// BUTTON SYSTEM
// ===============================

client.on(
  "interactionCreate",
  async interaction => {

    if (
      !interaction.isButton()
    ) return;

    try {

      // =========================
      // CREATE TICKET
      // =========================

      if (
        interaction.customId ===
        "create_ticket"
      ) {

        const existing =
          interaction.guild.channels.cache.find(
            channel =>
              channel.name ===
              `ticket-${interaction.user.id}`
          );

        if (existing) {

          return interaction.reply({
            content:
              `🎫 You already have a ticket: ${existing}`,
            ephemeral: true
          });

        }

        const channel =
          await interaction.guild.channels.create({
            name:
              `ticket-${interaction.user.id}`,
            type:
              ChannelType.GuildText,
            permissionOverwrites: [
              {
                id:
                  interaction.guild.roles.everyone.id,
                deny: [
                  PermissionFlagsBits.ViewChannel
                ]
              },
              {
                id:
                  interaction.user.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              }
            ]
          });

        const embed =
          new EmbedBuilder()
            .setTitle("🎫 Support Ticket")
            .setDescription(
              `Welcome ${interaction.user}!\n\n` +
              `Please explain your issue here.\n` +
              `A staff member will assist you soon.`
            )
            .setFooter({
              text:
                "Prime Development Studio"
            });

        const row =
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "close_ticket"
                )
                .setLabel("Close Ticket")
                .setEmoji("🔒")
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        await channel.send({
          content:
            `${interaction.user}`,
          embeds: [embed],
          components: [row]
        });

        return interaction.reply({
          content:
            `🎫 Ticket created: ${channel}`,
          ephemeral: true
        });
      }

      // =========================
      // CLOSE TICKET
      // =========================

      if (
        interaction.customId ===
        "close_ticket"
      ) {

        await interaction.reply(
          "🔒 Closing ticket..."
        );

        setTimeout(
          async () => {

            try {

              await interaction.channel.delete();

            } catch {}

          },
          3000
        );

        return;
      }

      // =========================
      // GIVEAWAY ENTRY
      // =========================

      if (
        interaction.customId.startsWith(
          "giveaway_enter_"
        )
      ) {

        const giveawayId =
          interaction.customId.replace(
            "giveaway_enter_",
            ""
          );

        const giveaway =
          giveaways.get(
            giveawayId
          );

        if (!giveaway) {

          return interaction.reply({
            content:
              "❌ This giveaway has ended.",
            ephemeral: true
          });

        }

        if (
          giveaway.participants.has(
            interaction.user.id
          )
        ) {

          giveaway.participants.delete(
            interaction.user.id
          );

          return interaction.reply({
            content:
              "❌ You left the giveaway.",
            ephemeral: true
          });

        }

        giveaway.participants.add(
          interaction.user.id
        );

        return interaction.reply({
          content:
            "🎉 You entered the giveaway!",
          ephemeral: true
        });
      }

    } catch (error) {

      console.error(
        "BUTTON ERROR:",
        error
      );

    }

  }
);

// ===============================
// AUTOMATIC AI + XP + ANTI LINK
// ===============================

client.on(
  "messageCreate",
  async message => {

    if (message.author.bot)
      return;

    if (!message.guild)
      return;

    const guild =
      message.guild;

    // ===========================
    // ANTI LINK
    // ===========================

    if (
      antiLinkServers.has(
        guild.id
      )
    ) {

      const linkRegex =
        /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

      if (
        linkRegex.test(
          message.content
        )
      ) {

        try {

          await message.delete();

          const warning =
            await message.channel.send(
              `🔗 **Anti-Link Protection**: ${message.author}, links/invites are not allowed here.`
            );

          setTimeout(
            () =>
              warning.delete().catch(
                () => {}
              ),
            5000
          );

        } catch (error) {

          console.error(
            "ANTI LINK ERROR:",
            error
          );

        }

        return;
      }
    }

    // ===========================
    // XP SYSTEM
    // ===========================

    const levelData =
      getLevelData(
        guild.id,
        message.author.id
      );

    const gainedXP =
      Math.floor(
        Math.random() * 11
      ) + 10;

    levelData.xp +=
      gainedXP;

    const needed =
      xpRequired(
        levelData.level
      );

    if (
      levelData.xp >=
      needed
    ) {

      levelData.xp -=
        needed;

      levelData.level++;

      try {

        await message.channel.send(
          `🎉 ${message.author} reached **Level ${levelData.level}**!`
        );

      } catch {}

    }

    // ===========================
    // AUTOMATIC AI
    // ===========================

    const channel =
      aiChannels.get(
        guild.id
      );

    if (!channel)
      return;

    if (
      message.channel.id !==
      channel
    )
      return;

    try {

      await message.channel.sendTyping();

      const prompt = `
You are Prime Development Studio AI.

User:
${message.author.username}

Message:
${message.content}

Reply naturally and helpfully.
`;

      const answer =
        await askAI(prompt);

      await message.reply(
        answer.substring(0, 1900)
      );

    } catch (error) {

      console.error(
        "AUTO AI ERROR:",
        error
      );

    }

  }
);

// ===============================
// WEB SERVER FOR RENDER
// ===============================

const app = express();

app.get(
  "/",
  (req, res) => {

    res.send(
      "🚀 Prime Development Studio AI is Online!"
    );

  }
);

app.get(
  "/health",
  (req, res) => {

    res.json({
      status: "online",
      model: MODEL,
      features: [
        "AI",
        "Tickets",
        "Giveaways",
        "Welcome",
        "Levels",
        "Economy",
        "Anti-Link"
      ]
    });

  }
);

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  () => {

    console.log(
      `🌐 Web server running on ${PORT}`
    );

  }
);

// ===============================
// LOGIN
// ===============================

client.login(TOKEN);
