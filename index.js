require("dotenv").config();
const express = require("express");
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !GEMINI_API_KEY) {
  console.error("❌ Missing DISCORD_TOKEN, CLIENT_ID, or GEMINI_API_KEY in environment variables!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Fast Direct Gemini AI Function
async function askAI(promptText) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
  } catch (err) {
    console.error("AI Error:", err);
    return "❌ AI is currently busy, please try again later.";
  }
}

// Commands list
const commands = [
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Gemini AI se kuch bhi poochein")
    .addStringOption(option => 
      option.setName("query").setDescription("Aapka sawal").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Bot ka speed check karein"),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Messages delete karein")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option.setName("count").setDescription("Kitne messages delete karne hain (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)
    )
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(`🚀 AI Bot online ho gaya hai: ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash commands successfully register ho gayi hain!");
  } catch (e) {
    console.error("Command registration error:", e);
  }
});

// Interaction Handler (Fast AI & Commands)
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "ai") {
      await interaction.deferReply();
      const userQuery = interaction.options.getString("query");
      const aiResponse = await askAI(userQuery);
      
      const finalReply = aiResponse.length > 2000 ? aiResponse.slice(0, 1997) + "..." : aiResponse;
      return interaction.editReply(finalReply);
    }

    if (interaction.commandName === "ping") {
      const latency = Date.now() - interaction.createdTimestamp;
      return interaction.reply({ content: `🏓 Pong! Latency: **${latency}ms** | API Ping: **${Math.round(client.ws.ping)}ms**`, ephemeral: true });
    }

    if (interaction.commandName === "clear") {
      const count = interaction.options.getInteger("count");
      await interaction.channel.bulkDelete(count, true);
      return interaction.reply({ content: `🧹 Successfully **${count}** messages delete kar diye gaye hain.`, ephemeral: true });
    }
  } catch (err) {
    console.error("Interaction Error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Kuch error aa gaya hai.", ephemeral: true }).catch(() => {});
    }
  }
});

// Link Protection & Auto-Mod
client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  // Link Detector Regex
  const linkRegex = /(https?:\/\/|www\.)\S+/i;
  if (linkRegex.test(message.content)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(() => {});
      const warning = await message.channel.send(`⚠️ ${message.author}, is server par links bhejna allowed nahi hai!`).catch(() => null);
      if (warning) setTimeout(() => warning.delete().catch(() => {}), 4000);
    }
  }
});

// Express Server 24/7 Uptime ke liye
const app = express();
app.get("/", (_, res) => res.send("AI Bot is running smoothly 24/7!"));
app.listen(PORT, () => console.log(`🌐 Web server port ${PORT} par active hai.`));

client.login(TOKEN);
