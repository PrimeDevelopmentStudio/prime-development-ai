const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");

const express = require("express");

// ========================================
// PRIME DEVELOPMENT STUDIO AI BOT
// ========================================

// Secrets GitHub par nahi hain.
// Ye Render Environment Variables se aayenge.

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Check configuration
if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN missing!");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID missing!");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing!");
  process.exit(1);
}

// ========================================
// GEMINI
// ========================================

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

// ========================================
// DISCORD CLIENT
// ========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ========================================
// SLASH COMMANDS
// ========================================

const commands = [

  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Ask Prime AI anything.")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency."),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information."),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user information.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select a user.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages.")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete.")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages.toString()
    )

].map(command => command.toJSON());

// ========================================
// REGISTER COMMANDS
// ========================================

const rest = new REST({
  version: "10"
}).setToken(DISCORD_TOKEN);

async function registerCommands() {

  try {

    console.log("🔄 Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands
      }
    );

    console.log("✅ Slash commands registered!");

  } catch (error) {

    console.error("❌ Command registration failed:");
    console.error(error);

  }

}

// ========================================
// BOT READY
// ========================================

client.once("ready", () => {

  console.log("================================");
  console.log("🤖 PRIME DEVELOPMENT STUDIO");
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("================================");

  client.user.setPresence({
    activities: [
      {
        name: "Prime Development Studio",
        type: 3
      }
    ],
    status: "online"
  });

});

// ========================================
// INTERACTION HANDLER
// ========================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {

    // ==================================
    // PING
    // ==================================

    if (interaction.commandName === "ping") {

      await interaction.reply(
        `🏓 **Pong!**\nLatency: **${client.ws.ping}ms**`
      );

      return;
    }

    // ==================================
    // SERVER INFO
    // ==================================

    if (interaction.commandName === "serverinfo") {

      const guild = interaction.guild;

      const embed = new EmbedBuilder()
        .setTitle("🏢 Server Information")
        .setDescription(
          `**${guild.name}**`
        )
        .addFields(
          {
            name: "👥 Members",
            value: `${guild.memberCount}`,
            inline: true
          },
          {
            name: "🆔 Server ID",
            value: `${guild.id}`,
            inline: true
          },
          {
            name: "📅 Created",
            value: `<t:${Math.floor(
              guild.createdTimestamp / 1000
            )}:D>`,
            inline: true
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

      return;
    }

    // ==================================
    // USER INFO
    // ==================================

    if (interaction.commandName === "userinfo") {

      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      const embed = new EmbedBuilder()
        .setTitle("👤 User Information")
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          {
            name: "Username",
            value: user.tag,
            inline: true
          },
          {
            name: "User ID",
            value: user.id,
            inline: true
          },
          {
            name: "Account Created",
            value: `<t:${Math.floor(
              user.createdTimestamp / 1000
            )}:D>`
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

      return;
    }

    // ==================================
    // CLEAR
    // ==================================

    if (interaction.commandName === "clear") {

      if (
        !interaction.member.permissions.has(
          PermissionFlagsBits.ManageMessages
        )
      ) {

        await interaction.reply({
          content:
            "❌ You need **Manage Messages** permission.",
          ephemeral: true
        });

        return;
      }

      const amount =
        interaction.options.getInteger("amount");

      const deleted =
        await interaction.channel.bulkDelete(
          amount,
          true
        );

      await interaction.reply({
        content:
          `🧹 Successfully deleted **${deleted.size}** messages.`,
        ephemeral: true
      });

      return;
    }

    // ==================================
    // PRIME AI
    // ==================================

    if (interaction.commandName === "ai") {

      const question =
        interaction.options.getString("question");

      await interaction.deferReply();

      const prompt = `
You are Prime AI, the official AI assistant
of Prime Development Studio.

Your personality:
- Friendly
- Professional
- Helpful
- Clear
- Modern

You understand:
- English
- Hindi
- Hinglish

Rules:
- Give useful answers.
- Do not pretend to be human.
- If you don't know something, say so.
- Keep Discord answers reasonably concise.
- Use Discord markdown when useful.

User question:
${question}
`;

      const response =
        await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt
        });

      const answer =
        response.text ||
        "❌ I couldn't generate a response.";

      // Discord message limit protection
      const finalAnswer =
        answer.length > 1900
          ? answer.substring(0, 1890) + "..."
          : answer;

      await interaction.editReply({
        content:
          `🤖 **Prime AI**\n\n${finalAnswer}`
      });

      return;
    }

  } catch (error) {

    console.error("❌ Interaction Error:");
    console.error(error);

    const errorMessage = {
      content:
        "❌ Something went wrong. Please try again."
    };

    try {

      if (
        interaction.deferred ||
        interaction.replied
      ) {

        await interaction.editReply(
          errorMessage
        );

      } else {

        await interaction.reply({
          ...errorMessage,
          ephemeral: true
        });

      }

    } catch {}

  }

});

// ========================================
// HEALTH SERVER FOR RENDER
// ========================================

const app = express();

app.get("/", (req, res) => {

  res.send(
    "🤖 Prime Development Studio AI Bot is online!"
  );

});

app.get("/health", (req, res) => {

  res.json({
    status: "online",
    bot:
      client.user?.tag ||
      "starting"
  });

});

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 Web server running on port ${PORT}`
    );

  }
);

// ========================================
// START BOT
// ========================================

(async () => {

  await registerCommands();

  await client.login(
    DISCORD_TOKEN
  );

})();
