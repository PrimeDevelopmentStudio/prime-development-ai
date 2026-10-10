require("dotenv").config();
const express = require("express");
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, ChannelType
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

const player = new Player(client);
const aiChannels = new Map();

// Fixed & Updated Gemini AI Function (Using gemini-2.0-flash)
async function askAI(promptText) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    
    const data = await response.json();
    
    // Agar Google API se koi error aaye toh console mein print karega
    if (data.error) {
      console.error("Gemini API Error Details:", data.error);
      return `❌ AI Error: ${data.error.message || "Unknown error"}`;
    }

    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
  } catch (err) {
    console.error("Fetch Exception:", err);
    return "❌ Network error while connecting to AI.";
  }
}

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
      return interaction.reply({ content: `⚡ Successfully **${channel}** ko **Instant AI Channel** set kar diya gaya hai!`, ephemeral: true });
    }

    if (commandName === "play") {
      const query = options.getString("song");
      const voiceChannel = member.voice.channel;

      if (!voiceChannel) {
        return interaction.reply({ content: "❌ Pehle aapko kisi Voice Channel mein join hona padega!", ephemeral: true });
      }

      await interaction.deferReply();

      try {
        const queue = player.nodes.create(guild, { metadata: interaction.channel });
        if (!queue.connection) await queue.connect(voiceChannel);

        const searchResult = await player.search(query, { requestedBy: interaction.user });
        if (!searchResult.hasTracks()) {
          return interaction.editReply("❌ Koi song nahi mila!");
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
      return interaction.reply("⏹️ Music stopped and bot disconnected.");
    }
  } catch (err) {
    console.error("Interaction Error:", err);
  }
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const targetChannelId = aiChannels.get(message.guild.id);
  if (targetChannelId && message.channel.id === targetChannelId) {
    await message.channel.sendTyping();
    const reply = await askAI(message.content);
    const finalReply = reply.length > 2000 ? reply.slice(0, 1997) + "..." : reply;
    return message.reply(finalReply).catch(() => {});
  }
});

const app = express();
app.get("/", (_, res) => res.send("Bot is running 24/7!"));
app.listen(PORT, () => console.log(`🌐 Web server active on port ${PORT}`));

client.login(TOKEN);
