const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");

// ======================================================
// PRIME DEVELOPMENT STUDIO AI
// ALL-IN-ONE DISCORD BOT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================================================
// CONFIG
// ======================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const PREFIX = "!";
const MODEL = "gemini-3.8-flash";

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

// Simple warning storage
const warnings = new Map();

// ======================================================
// CHECK CONFIG
// ======================================================

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is missing!");
  process.exit(1);
}

// ======================================================
// READY
// ======================================================

client.once("ready", () => {
  console.log("======================================");
  console.log(" PRIME DEVELOPMENT STUDIO AI");
  console.log("======================================");
  console.log(`🤖 Bot: ${client.user.tag}`);
  console.log(`🧠 AI: ${MODEL}`);
  console.log(`🏠 Servers: ${client.guilds.cache.size}`);
  console.log("✅ Bot is ONLINE");
  console.log("======================================");

  client.user.setPresence({
    activities: [
      {
        name: "Prime Development Studio | !help",
        type: 0
      }
    ],
    status: "online"
  });
});

// ======================================================
// HELPER FUNCTIONS
// ======================================================

function hasPermission(message, permission) {
  return message.member?.permissions.has(permission);
}

function getTargetMember(message, args) {
  return (
    message.mentions.members.first() ||
    message.guild.members.cache.get(args[0])
  );
}

function getReason(args, start = 1) {
  return args.slice(start).join(" ") || "No reason provided.";
}

function formatUser(user) {
  return `${user.tag} (${user.id})`;
}

// ======================================================
// AI FUNCTION
// ======================================================

async function askGemini(message, question) {
  const loading = await message.reply("🤖 **Thinking...**");

  try {
    const prompt = `
You are **Prime Development Studio AI**, a professional Discord AI assistant.

You help users with:

• Discord bots
• Discord servers
• JavaScript
• Node.js
• Websites
• Apps
• Games
• Programming
• Debugging
• APIs
• Development
• Technology

Rules:

1. Give accurate and useful answers.
2. If the user asks for code, give complete copy-paste-ready code.
3. Do not intentionally provide broken code.
4. Support English, Hindi and Hinglish.
5. Keep normal answers reasonably concise.
6. For technical questions, explain the important steps.
7. If there is an error, identify the likely cause and provide a fix.
8. Never claim that you performed an action that you cannot actually perform.
9. Your name is Prime Development Studio AI.

User:
${question}
`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt
    });

    let answer = response.text;

    if (!answer) {
      answer = "⚠️ Gemini did not return a response.";
    }

    // Discord maximum message size protection
    if (answer.length <= 1900) {
      await loading.edit(answer);
      return;
    }

    const chunks = [];

    for (let i = 0; i < answer.length; i += 1900) {
      chunks.push(answer.substring(i, i + 1900));
    }

    await loading.edit(chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }

  } catch (error) {
    console.error("Gemini Error:", error);

    await loading.edit(
      "❌ **Gemini Error**\n\n" +
      "AI response nahi aa saka.\n" +
      "Please check your Gemini API key and API availability."
    );
  }
}

// ======================================================
// MESSAGE CREATE
// ======================================================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  // ====================================================
  // BOT MENTION AI
  // ====================================================

  if (message.guild && message.mentions.has(client.user)) {

    const question = message.content
      .replace(`<@${client.user.id}>`, "")
      .replace(`<@!${client.user.id}>`, "")
      .trim();

    if (!question) {
      return message.reply(
        "👋 Hello! I'm **Prime Development Studio AI**.\n\n" +
        "Use `!help` to see my commands.\n" +
        "Or ask me something like:\n" +
        "`!ai make me a Discord bot`"
      );
    }

    return askGemini(message, question);
  }

  // ====================================================
  // PREFIX CHECK
  // ====================================================

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  const command = args.shift()?.toLowerCase();

  if (!command) return;

  // ====================================================
  // HELP
  // ====================================================

  if (command === "help" || command === "commands") {

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("🤖 Prime Development Studio AI")
      .setDescription(
        "Professional AI + Discord Management Bot\n\n" +
        "**🤖 AI**\n" +
        "`!ai <question>`\n" +
        "`@Prime Development Studio AI <question>`\n\n" +

        "**📢 Announcements**\n" +
        "`!announce #channel | message`\n" +
        "`!embedannounce #channel | title | message`\n\n" +

        "**🛡️ Moderation**\n" +
        "`!clear <amount>`\n" +
        "`!kick @user reason`\n" +
        "`!ban @user reason`\n" +
        "`!timeout @user 10m reason`\n" +
        "`!untimeout @user`\n" +
        "`!warn @user reason`\n" +
        "`!warnings @user`\n\n" +

        "**🔒 Server Management**\n" +
        "`!lock`\n" +
        "`!unlock`\n" +
        "`!slowmode <seconds>`\n\n" +

        "**🔧 Utility**\n" +
        "`!ping`\n" +
        "`!serverinfo`\n" +
        "`!userinfo @user`\n" +
        "`!avatar @user`\n" +
        "`!botinfo`\n" +
        "`!say <message>`\n" +
        "`!poll Question | Option 1 | Option 2`"
      )
      .setFooter({
        text: "Prime Development Studio AI"
      })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ====================================================
  // PING
  // ====================================================

  if (command === "ping") {

    return message.reply(
      `🏓 **Pong!**\nLatency: **${client.ws.ping}ms**`
    );
  }

  // ====================================================
  // AI
  // ====================================================

  if (command === "ai") {

    const question = args.join(" ");

    if (!question) {
      return message.reply(
        "❌ Usage:\n`!ai <your question>`"
      );
    }

    return askGemini(message, question);
  }

  // ====================================================
  // BOT INFO
  // ====================================================

  if (command === "botinfo") {

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("🤖 Prime Development Studio AI")
      .addFields(
        {
          name: "Bot",
          value: client.user.tag,
          inline: true
        },
        {
          name: "Servers",
          value: `${client.guilds.cache.size}`,
          inline: true
        },
        {
          name: "Users",
          value: `${client.guilds.cache.reduce(
            (total, guild) => total + guild.memberCount,
            0
          )}`,
          inline: true
        },
        {
          name: "AI Model",
          value: MODEL,
          inline: true
        },
        {
          name: "Library",
          value: "discord.js",
          inline: true
        },
        {
          name: "Prefix",
          value: "`!`",
          inline: true
        }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ====================================================
  // SERVER INFO
  // ====================================================

  if (command === "serverinfo") {

    const guild = message.guild;

    if (!guild) {
      return message.reply("❌ This command can only be used in a server.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
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
          value: `${guild.channels.cache.size}`,
          inline: true
        },
        {
          name: "🎭 Roles",
          value: `${guild.roles.cache.size}`,
          inline: true
        },
        {
          name: "🆔 Server ID",
          value: guild.id,
          inline: true
        },
        {
          name: "📅 Created",
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          inline: true
        }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ====================================================
  // USER INFO
  // ====================================================

  if (command === "userinfo") {

    const user =
      message.mentions.users.first() ||
      message.author;

    const member = message.guild?.members.cache.get(user.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`👤 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: "🆔 User ID",
          value: user.id,
          inline: false
        },
        {
          name: "📅 Account Created",
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
          inline: false
        }
      )
      .setTimestamp();

    if (member) {
      embed.addFields({
        name: "📥 Joined Server",
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
        inline: false
      });
    }

    return message.reply({ embeds: [embed] });
  }

  // ====================================================
  // AVATAR
  // ====================================================

  if (command === "avatar") {

    const user =
      message.mentions.users.first() ||
      message.author;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🖼️ ${user.tag}'s Avatar`)
      .setImage(
        user.displayAvatarURL({
          extension: "png",
          size: 1024
        })
      );

    return message.reply({ embeds: [embed] });
  }

  // ====================================================
  // SAY
  // ====================================================

  if (command === "say") {

    if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("❌ You need **Manage Messages** permission.");
    }

    const text = args.join(" ");

    if (!text) {
      return message.reply("❌ Usage: `!say <message>`");
    }

    await message.delete().catch(() => {});

    return message.channel.send(text);
  }

  // ====================================================
  // ANNOUNCE
  // ====================================================

  if (command === "announce") {

    if (!hasPermission(message, PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("❌ You need **Manage Server** permission.");
    }

    const raw = args.join(" ");
    const parts = raw.split("|");

    const channelMention = parts.shift()?.trim();
    const announcement = parts.join("|").trim();

    if (!channelMention || !announcement) {
      return message.reply(
        "❌ Usage:\n`!announce #channel | Your announcement`"
      );
    }

    const channelId = channelMention.replace(/[<#>]/g, "");
    const channel = message.guild.channels.cache.get(channelId);

    if (!channel || !channel.isTextBased()) {
      return message.reply("❌ Invalid text channel.");
    }

    await channel.send({
      content: announcement,
      allowedMentions: {
        parse: ["users", "roles"]
      }
    });

    return message.reply(`✅ Announcement sent to ${channel}.`);
  }

  // ====================================================
  // EMBED ANNOUNCE
  // ====================================================

  if (command === "embedannounce") {

    if (!hasPermission(message, PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("❌ You need **Manage Server** permission.");
    }

    const raw = args.join(" ");
    const parts = raw.split("|");

    const channelMention = parts.shift()?.trim();
    const title = parts.shift()?.trim();
    const description = parts.join("|").trim();

    if (!channelMention || !title || !description) {
      return message.reply(
        "❌ Usage:\n" +
        "`!embedannounce #channel | Title | Message`"
      );
    }

    const channelId = channelMention.replace(/[<#>]/g, "");
    const channel = message.guild.channels.cache.get(channelId);

    if (!channel || !channel.isTextBased()) {
      return message.reply("❌ Invalid text channel.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(title)
      .setDescription(description)
      .setFooter({
        text: "Prime Development Studio AI"
      })
      .setTimestamp();

    await channel.send({
      embeds: [embed]
    });

    return message.reply(`✅ Embed announcement sent to ${channel}.`);
  }

  // ====================================================
  // CLEAR
  // ====================================================

  if (command === "clear" || command === "purge") {

    if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("❌ You need **Manage Messages** permission.");
    }

    const amount = parseInt(args[0]);

    if (!amount || amount < 1 || amount > 100) {
      return message.reply(
        "❌ Enter a number between **1 and 100**."
      );
    }

    const deleted = await message.channel.bulkDelete(amount, true);

    const reply = await message.channel.send(
      `🧹 Deleted **${deleted.size}** messages.`
    );

    setTimeout(() => {
      reply.delete().catch(() => {});
    }, 3000);

    return;
  }

  // ====================================================
  // KICK
  // ====================================================

  if (command === "kick") {

    if (!hasPermission(message, PermissionsBitField.Flags.KickMembers)) {
      return message.reply("❌ You need **Kick Members** permission.");
    }

    const member = getTargetMember(message, args);

    if (!member) {
      return message.reply(
        "❌ Usage: `!kick @user reason`"
      );
    }

    if (!member.kickable) {
      return message.reply(
        "❌ I cannot kick this member. Check my role position and permissions."
      );
    }

    const reason = getReason(args);

    await member.kick(reason);

    return message.reply(
      `👢 **${formatUser(member.user)}** was kicked.\nReason: **${reason}**`
    );
  }

  // ====================================================
  // BAN
  // ====================================================

  if (command === "ban") {

    if (!hasPermission(message, PermissionsBitField.Flags.BanMembers)) {
      return message.reply("❌ You need **Ban Members** permission.");
    }

    const member = getTargetMember(message, args);

    if (!member) {
      return message.reply(
        "❌ Usage: `!ban @user reason`"
      );
    }

    if (!member.bannable) {
      return message.reply(
        "❌ I cannot ban this member. Check my role position and permissions."
      );
    }

    const reason = getReason(args);

    await member.ban({
      reason: reason
    });

    return message.reply(
      `🔨 **${formatUser(member.user)}** was banned.\nReason: **${reason}**`
    );
  }

  // ====================================================
  // TIMEOUT
  // ====================================================

  if (command === "timeout") {

    if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("❌ You need **Moderate Members** permission.");
    }

    const member = getTargetMember(message, args);

    if (!member) {
      return message.reply(
        "❌ Usage: `!timeout @user 10m reason`"
      );
    }

    const durationText = args[1];

    if (!durationText) {
      return message.reply(
        "❌ Example: `!timeout @user 10m spam`"
      );
    }

    let duration = 0;

    if (durationText.endsWith("s")) {
      duration = parseInt(durationText) * 1000;
    } else if (durationText.endsWith("m")) {
      duration = parseInt(durationText) * 60 * 1000;
    } else if (durationText.endsWith("h")) {
      duration = parseInt(durationText) * 60 * 60 * 1000;
    } else if (durationText.endsWith("d")) {
      duration = parseInt(durationText) * 24 * 60 * 60 * 1000;
    }

    if (!duration || duration < 1000) {
      return message.reply(
        "❌ Use a duration like `30s`, `10m`, `2h` or `1d`."
      );
    }

    if (duration > 28 * 24 * 60 * 60 * 1000) {
      return message.reply(
        "❌ Maximum timeout is **28 days**."
      );
    }

    if (!member.moderatable) {
      return message.reply(
        "❌ I cannot timeout this member."
      );
    }

    const reason = args.slice(2).join(" ") || "No reason provided.";

    await member.timeout(duration, reason);

    return message.reply(
      `⏳ **${formatUser(member.user)}** has been timed out for **${durationText}**.\nReason: **${reason}**`
    );
  }

  // ====================================================
  // UNTIMEOUT
  // ====================================================

  if (command === "untimeout") {

    if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("❌ You need **Moderate Members** permission.");
    }

    const member = getTargetMember(message, args);

    if (!member) {
      return message.reply(
        "❌ Usage: `!untimeout @user`"
      );
    }

    await member.timeout(null);

    return message.reply(
      `✅ Timeout removed from **${formatUser(member.user)}**.`
    );
  }

  // ====================================================
  // WARN
  // ====================================================

  if (command === "warn") {

    if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("❌ You need **Moderate Members** permission.");
    }

    const member = getTargetMember(message, args);

    if (!member) {
      return message.reply(
        "❌ Usage: `!warn @user reason`"
      );
    }

    const reason = getReason(args);

    if (!warnings.has(member.id)) {
      warnings.set(member.id, []);
    }

    const userWarnings = warnings.get(member.id);

    userWarnings.push({
      reason: reason,
      moderator: message.author.id,
      time: Date.now()
    });

    return message.reply(
      `⚠️ **${formatUser(member.user)}** has been warned.\n` +
      `Reason: **${reason}**\n` +
      `Total warnings: **${userWarnings.length}**`
    );
  }

  // ====================================================
  // WARNINGS
  // ====================================================

  if (command === "warnings") {

    const member = getTargetMember(message, args);

    if (!member) {
      return message.reply(
        "❌ Usage: `!warnings @user`"
      );
    }

    const userWarnings = warnings.get(member.id) || [];

    if (userWarnings.length === 0) {
      return message.reply(
        `✅ **${formatUser(member.user)}** has no warnings.`
      );
    }

    const text = userWarnings
      .map(
        (w, i) =>
          `**${i + 1}.** ${w.reason}`
      )
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle(`⚠️ Warnings — ${member.user.tag}`)
      .setDescription(text)
      .setFooter({
        text: `Total: ${userWarnings.length}`
      });

    return message.reply({
      embeds: [embed]
    });
  }

  // ====================================================
  // LOCK
  // ====================================================

  if (command === "lock") {

    if (!hasPermission(message, PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("❌ You need **Manage Channels** permission.");
    }

    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    return message.reply("🔒 **Channel locked.**");
  }

  // ====================================================
  // UNLOCK
  // ====================================================

  if (command === "unlock") {

    if (!hasPermission(message, PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("❌ You need **Manage Channels** permission.");
    }

    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    return message.reply("🔓 **Channel unlocked.**");
  }

  // ====================================================
  // SLOWMODE
  // ====================================================

  if (command === "slowmode") {

    if (!hasPermission(message, PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("❌ You need **Manage Channels** permission.");
    }

    const seconds = parseInt(args[0]);

    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
      return message.reply(
        "❌ Enter a value between **0 and 21600 seconds**."
      );
    }

    await message.channel.setRateLimitPerUser(seconds);

    return message.reply(
      `🐌 Slowmode set to **${seconds} seconds**.`
    );
  }

  // ====================================================
  // POLL
  // ====================================================

  if (command === "poll") {

    if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("❌ You need **Manage Messages** permission.");
    }

    const raw = args.join(" ");
    const parts = raw.split("|").map(x => x.trim());

    if (parts.length < 3) {
      return message.reply(
        "❌ Usage:\n" +
        "`!poll Question | Option 1 | Option 2`"
      );
    }

    const question = parts[0];
    const options = parts.slice(1, 6);

    const numbers = [
      "1️⃣",
      "2️⃣",
      "3️⃣",
      "4️⃣",
      "5️⃣"
    ];

    const description = options
      .map((option, index) => {
        return `${numbers[index]} ${option}`;
      })
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("📊 " + question)
      .setDescription(description)
      .setFooter({
        text: "Prime Development Studio AI • Poll"
      })
      .setTimestamp();

    const pollMessage = await message.channel.send({
      embeds: [embed]
    });

    for (let i = 0; i < options.length; i++) {
      await pollMessage.react(numbers[i]);
    }

    return;
  }

  // ====================================================
  // UNKNOWN COMMAND
  // ====================================================

  return message.reply(
    `❌ Unknown command: \`${command}\`\n` +
    `Use \`!help\` to see all commands.`
  );
});

// ======================================================
// ERROR HANDLERS
// ======================================================

client.on("error", (error) => {
  console.error("Discord Client Error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled Promise Rejection:", error);
});

// ======================================================
// LOGIN
// ======================================================

client.login(DISCORD_TOKEN);
