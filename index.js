require("dotenv").config();
const express = require("express");
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, ChannelType, EmbedBuilder
} = require("discord.js");
const { Player } = require("discord-player");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !GEMINI_API_KEY) {
  console.error("❌ Missing Environment Variables in .env!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Initialize Music Player
const player = new Player(client);
// Extractors automatically register in newer discord-player versions

// Store AI Channel IDs per server in memory for instant speed
const aiChannels = new Map();

// Super Fast Direct Gemini AI Function
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
    return "❌ AI is currently busy, please try again.";
  }
}

// Slash Commands Setup
const commands = [
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Gemini AI se kuch bhi poochein")
    .addStringOption(o => o.setName("query").setDescription("Aapka sawal").setRequired(true)),
  
  new SlashCommandBuilder()
    .setName("setai")
    .setDescription("Is channel ko instant AI chat channel banayein")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName("channel").setDescription("Text channel select karein").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Kisi bhi voice channel mein song play karein")
    .addStringOption(o => o.setName("song").setDescription("Song ka naam ya URL").setRequired(true)),
  
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Music rok kar bot ko voice channel se disconnect karein")
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(`🤖 AI & Music Bot online ho gaya hai: ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Commands successfully registered!");
  } catch (e) {
    console.error("Command registration error:", e);
  }
});

// Interaction Handler
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName, guild, member, options } = interaction;

    if (commandName === "ai") {
      await interaction.deferReply();
      const query = options.getString("query");
      const reply = await askAI(query);
      return interaction.editReply(reply.length > 2000 ? reply.slice(0, 1997) + "..." : reply);
    }

    if (commandName === "setai") {
      const channel = options.getChannel("channel");
      aiChannels.set(guild.id, channel.id);
      return interaction.reply({ content: `⚡ Successfully **${channel}** ko **Instant AI Channel** set kar diya gaya hai! Ab yahan bina command ke jo bhi likhega bot fatafat jawab dega.`, ephemeral: true });
    }

    if (commandName === "play") {
      const query = options.getString("song");
      const voiceChannel = member.voice.channel;

      if (!voiceChannel) {
        return interaction.reply({ content: "❌ Pehle aapko kisi Voice Channel mein join hona padega!", ephemeral: true });
      }

      await interaction.deferReply();

      try {
        const queue = player.nodes.create(guild, {
          metadata: interaction.channel
        });

        if (!queue.connection) await queue.connect(voiceChannel);

        const searchResult = await player.search(query, {
          requestedBy: interaction.user
        });

        if (!searchResult.hasTracks()) {
          return interaction.editReply("❌ Koi song nahi mila! Kripya sahi naam daalein.");
        }

        queue.addTrack(searchResult.tracks[0]);
        if (!queue.isPlaying()) await queue.node.play();

        return interaction.editReply(`🎶 Playing: **${searchResult.tracks[0].title}**`);
      } catch (e) {
        console.error("Music Play Error:", e);
        return interaction.editReply("❌ Song play karne mein kuch error aa gaya.");
      }
    }

    if (commandName === "stop") {
      const queue = player.nodes.get(guild.id);
      if (!queue) return interaction.reply({ content: "❌ Abhi koi song play nahi ho raha hai.", ephemeral: true });
      queue.delete();
      return interaction.reply("⏹️ Music stopped and bot disconnected from voice channel.");
    }
  } catch (err) {
    console.error("Interaction Error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Kuch error aa gaya hai.", ephemeral: true }).catch(() => {});
    }
  }
});

// Fatafat Answer dene wala Instant AI Message Handler (For SetAI Channel)
client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const targetChannelId = aiChannels.get(message.guild.id);
  if (targetChannelId && message.channel.id === targetChannelId) {
    // Typing indicator taaki pata chale bot fast likh raha hai
    await message.channel.sendTyping();
    const reply = await askAI(message.content);
    const finalReply = reply.length > 2000 ? reply.slice(0, 1997) + "..." : reply;
    return message.reply(finalReply).catch(() => {});
  }
});

// Express Web Server for 24/7 Uptime (Render)
const app = express();
app.get("/", (_, res) => res.send("AI & Music Bot is running 24/7!"));
app.listen(PORT, () => console.log(`🌐 Web server active on port ${PORT}`));

client.login(TOKEN);
