require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes
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
    GatewayIntentBits.MessageContent
  ]
});

// ===============================
// DATA
// ===============================

const aiChannels = new Map();

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
// COMMANDS
// ===============================

const commands = [

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

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Create announcement")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Announcement message")
        .setRequired(true)
    ),

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
// SLASH COMMANDS
// ===============================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isChatInputCommand())
      return;

    try {

      // =========================
      // /AI
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

          `📢 **Announcements**\n` +
          `/announce\n\n` +

          `📊 **Information**\n` +
          `/serverinfo\n` +
          `/userinfo\n` +
          `/avatar\n\n` +

          `⚙️ **System**\n` +
          `/help`
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
          content: "❌ Command error.",
          ephemeral: true
        });

      }

    }

  }
);

// ===============================
// AUTOMATIC AI
// ===============================

client.on(
  "messageCreate",
  async message => {

    if (message.author.bot)
      return;

    if (!message.guild)
      return;

    const channel =
      aiChannels.get(
        message.guild.id
      );

    if (!channel)
      return;

    if (
      message.channel.id !== channel
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

app.get("/", (req, res) => {

  res.send(
    "🚀 Prime Development Studio AI is Online!"
  );

});

app.get("/health", (req, res) => {

  res.json({
    status: "online",
    model: MODEL
  });

});

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
