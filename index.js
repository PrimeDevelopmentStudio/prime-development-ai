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
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const ai = new GoogleGenAI({
  apiKey: GEMINI_KEY
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
       .setDescription("Ask anything")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setaichannel")
    .setDescription("Set automatic AI channel")
    .addChannelOption(o =>
      o.setName("channel")
       .setDescription("Select AI channel")
       .addChannelTypes(ChannelType.GuildText)
       .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("removeaichannel")
    .setDescription("Remove automatic AI channel")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

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
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers.toString()
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers.toString()
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
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages.toString()
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
       .setMaxValue(40320)
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
       .setDescription("Reason")
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers.toString()
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers.toString()
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick member")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
       .setDescription("Reason")
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.KickMembers.toString()
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban member")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Member")
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
       .setDescription("Reason")
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.BanMembers.toString()
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban user")
    .addStringOption(o =>
      o.setName("userid")
       .setDescription("User ID")
       .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.BanMembers.toString()
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock channel")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels.toString()
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock channel")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels.toString()
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode")
    .addIntegerOption(o =>
      o.setName("seconds")
       .setDescription("0-21600 seconds")
       .setMinValue(0)
       .setMaxValue(21600)
       .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels.toString()
    ),

  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set log channel")
    .addChannelOption(o =>
      o.setName("channel")
       .setDescription("Log channel")
       .addChannelTypes(ChannelType.GuildText)
       .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
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
];

async function askAI(prompt) {
  try {
    console.log("🤖 Gemini request started");

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt
    });

    console.log("✅ Gemini response received");

    return response.text || "AI returned an empty response.";
  } catch (error) {
    console.error("❌ GEMINI ERROR:", error);
    return "❌ Gemini request failed. Check Render logs.";
  }
}

async function sendLog(guild, text) {
  const channelId = logChannels.get(guild.id);
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(text)
        .setTimestamp()
    ]
  }).catch(() => {});
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: "Prime Development Studio",
        type: 3
      }
    ],
    status: "online"
  });

  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands.map(c => c.toJSON())
      }
    );

    console.log("✅ Slash commands registered");
  } catch (error) {
    console.error("❌ COMMAND ERROR:", error);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const cmd = interaction.commandName;

    if (cmd === "ai") {
      await interaction.deferReply();

      const question =
        interaction.options.getString("question");

      const answer = await askAI(
        `You are Prime Development Studio AI.
Be helpful, friendly and concise.

User:
${question}`
      );

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🤖 Prime AI")
            .setDescription(answer.slice(0, 4000))
            .setFooter({
              text: "Prime Development Studio"
            })
        ]
      });
    }

    if (cmd === "setaichannel") {
      const channel =
        interaction.options.getChannel("channel");

      aiChannels.set(
        interaction.guild.id,
        channel.id
      );

      return interaction.reply(
        `✅ Automatic AI channel set to ${channel}`
      );
    }

    if (cmd === "removeaichannel") {
      aiChannels.delete(interaction.guild.id);

      return interaction.reply(
        "✅ Automatic AI channel removed."
      );
    }

    if (cmd === "warn") {
      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString("reason");

      const key =
        `${interaction.guild.id}:${user.id}`;

      const list =
        warnings.get(key) || [];

      list.push({
        reason,
        moderator: interaction.user.tag
      });

      warnings.set(key, list);

      await sendLog(
        interaction.guild,
        `⚠️ **Warning**\nUser: ${user}\nModerator: ${interaction.user}\nReason: ${reason}`
      );

      return interaction.reply(
        `⚠️ ${user} warned.\nReason: ${reason}\nTotal warnings: ${list.length}`
      );
    }

    if (cmd === "warnings") {
      const user =
        interaction.options.getUser("user");

      const key =
        `${interaction.guild.id}:${user.id}`;

      const list =
        warnings.get(key) || [];

      if (!list.length) {
        return interaction.reply(
          `✅ ${user} has no warnings.`
        );
      }

      const text = list
        .map((w, i) =>
          `**${i + 1}.** ${w.reason} — ${w.moderator}`
        )
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle(`⚠️ Warnings — ${user.tag}`)
            .setDescription(text.slice(0, 4000))
        ]
      });
    }

    if (cmd === "clear") {
      const amount =
        interaction.options.getInteger("amount");

      const deleted =
        await interaction.channel.bulkDelete(
          amount,
          true
        );

      return interaction.reply({
        content:
          `🧹 Deleted ${deleted.size} messages.`,
        ephemeral: true
      });
    }

    if (cmd === "timeout") {
      const user =
        interaction.options.getUser("user");

      const minutes =
        interaction.options.getInteger("minutes");

      const reason =
        interaction.options.getString("reason") ||
        "No reason";

      const member =
        await interaction.guild.members.fetch(user.id);

      if (!member.moderatable) {
        return interaction.reply(
          "❌ I cannot timeout this member."
        );
      }

      await member.timeout(
        minutes * 60000,
        reason
      );

      return interaction.reply(
        `🔇 ${user} timed out for ${minutes} minutes.`
      );
    }

    if (cmd === "untimeout") {
      const user =
        interaction.options.getUser("user");

      const member =
        await interaction.guild.members.fetch(user.id);

      if (!member.moderatable) {
        return interaction.reply(
          "❌ I cannot modify this member."
        );
      }

      await member.timeout(null);

      return interaction.reply(
        `🔊 Timeout removed from ${user}.`
      );
    }

    if (cmd === "kick") {
      const user =
        interaction.options.getUser("user");

      const member =
        await interaction.guild.members.fetch(user.id);

      if (!member.kickable) {
        return interaction.reply(
          "❌ I cannot kick this member."
        );
      }

      const reason =
        interaction.options.getString("reason") ||
        "No reason";

      await member.kick(reason);

      return interaction.reply(
        `👢 ${user.tag} was kicked.`
      );
    }

    if (cmd === "ban") {
      const user =
        interaction.options.getUser("user");

      const member =
        await interaction.guild.members.fetch(user.id);

      if (!member.bannable) {
        return interaction.reply(
          "❌ I cannot ban this member."
        );
      }

      const reason =
        interaction.options.getString("reason") ||
        "No reason";

      await member.ban({
        reason
      });

      return interaction.reply(
        `🔨 ${user.tag} was banned.`
      );
    }

    if (cmd === "unban") {
      const id =
        interaction.options.getString("userid");

      await interaction.guild.members.unban(id);

      return interaction.reply(
        `✅ User ${id} unbanned.`
      );
    }

    if (cmd === "lock") {
      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: false
        }
      );

      return interaction.reply(
        "🔒 Channel locked."
      );
    }

    if (cmd === "unlock") {
      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: null
        }
      );

      return interaction.reply(
        "🔓 Channel unlocked."
      );
    }

    if (cmd === "slowmode") {
      const seconds =
        interaction.options.getInteger("seconds");

      await interaction.channel.setRateLimitPerUser(
        seconds
      );

      return interaction.reply(
        `🐌 Slowmode set to ${seconds} seconds.`
      );
    }

    if (cmd === "setlogchannel") {
      const channel =
        interaction.options.getChannel("channel");

      logChannels.set(
        interaction.guild.id,
        channel.id
      );

      return interaction.reply(
        `📋 Log channel set to ${channel}`
      );
    }

    if (cmd === "serverinfo") {
      const guild =
        interaction.guild;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`📊 ${guild.name}`)
            .addFields(
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
        ]
      });
    }

    if (cmd === "userinfo") {
      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`👤 ${user.tag}`)
            .setThumbnail(
              user.displayAvatarURL()
            )
            .addFields({
              name: "🆔 User ID",
              value: user.id
            })
        ]
      });
    }

    if (cmd === "avatar") {
      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      return interaction.reply(
        user.displayAvatarURL({
          size: 1024
        })
      );
    }

    if (cmd === "settings") {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⚙️ Prime AI Settings")
            .addFields(
              {
                name: "🤖 AI Channel",
                value:
                  aiChannels.has(interaction.guild.id)
                    ? `<#${aiChannels.get(interaction.guild.id)}>`
                    : "Not set"
              },
              {
                name: "📋 Log Channel",
                value:
                  logChannels.has(interaction.guild.id)
                    ? `<#${logChannels.get(interaction.guild.id)}>`
                    : "Not set"
              }
            )
        ]
      });
    }

    if (cmd === "help") {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(
              "🤖 Prime Development Studio AI"
            )
            .setDescription(
              "**🤖 AI**\n" +
              "`/ai` `/setaichannel` `/removeaichannel`\n\n" +

              "**🛡️ Moderation**\n" +
              "`/warn` `/warnings` `/clear`\n" +
              "`/timeout` `/untimeout` `/kick`\n" +
              "`/ban` `/unban`\n\n" +

              "**🔒 Channel**\n" +
              "`/lock` `/unlock` `/slowmode`\n" +
              "`/setlogchannel`\n\n" +

              "**📊 Information**\n" +
              "`/serverinfo` `/userinfo` `/avatar`\n\n" +

              "**⚙️ System**\n" +
              "`/settings` `/help`"
            )
            .setFooter({
              text: "Prime Development Studio"
            })
        ]
      });
    }

  } catch (error) {
    console.error(
      "❌ INTERACTION ERROR:",
      error
    );

    if (
      interaction.replied ||
      interaction.deferred
    ) {
      return interaction.editReply(
        "❌ Something went wrong."
      );
    }

    return interaction.reply({
      content: "❌ Something went wrong.",
      ephemeral: true
    });
  }
});

client.on("messageCreate", async message => {
  if (
    message.author.bot ||
    !message.guild
  ) return;

  const channelId =
    aiChannels.get(message.guild.id);

  if (
    !channelId ||
    message.channel.id !== channelId
  ) return;

  console.log(
    `💬 AI message from ${message.author.tag}`
  );

  const last =
    cooldown.get(message.author.id) || 0;

  if (
    Date.now() - last < 2000
  ) return;

  cooldown.set(
    message.author.id,
    Date.now()
  );

  const text =
    message.content.trim();

  if (!text) return;

  if (text.length > 1500) {
    return message.reply(
      "❌ Message is too long. Keep it under 1500 characters."
    );
  }

  try {
    await message.channel.sendTyping();

    const answer =
      await askAI(
        `You are Prime Development Studio AI,
a friendly Discord assistant.

User message:
${text}`
      );

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🤖 Prime AI")
          .setDescription(
            answer.slice(0, 4000)
          )
          .setFooter({
            text: "Prime Development Studio"
          })
      ]
    });

  } catch (error) {
    console.error(
      "❌ MESSAGE AI ERROR:",
      error
    );
  }
});

const app = express();

app.get("/", (req, res) => {
  res.send(
    "Prime Development Studio AI is ONLINE!"
  );
});

app.listen(
  process.env.PORT || 3000,
  () => {
    console.log(
      "🌐 Web server started"
    );
  }
);

client.login(TOKEN);
