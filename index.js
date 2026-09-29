require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require("@discordjs/voice");

const { GoogleGenAI } = require("@google/genai");
const play = require("play-dl");
const express = require("express");

// =========================
// CONFIG
// =========================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.8-flash";

if (!TOKEN || !CLIENT_ID || !GEMINI_API_KEY) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID or GEMINI_API_KEY");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const app = express();
app.get("/", (_, res) => res.send("Prime Development Studio AI is online."));
app.get("/health", (_, res) => res.json({ ok: true }));
app.listen(process.env.PORT || 3000, () => console.log("Web server online."));

const aiChannels = new Map();
const welcomeChannels = new Map();
const antiLinkServers = new Set();
const levels = new Map();
const economy = new Map();
const dailyCooldown = new Map();
const giveaways = new Map();

// guildId -> music state
const music = new Map();

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getEco(guildId, userId) {
  const k = key(guildId, userId);
  if (!economy.has(k)) economy.set(k, { cash: 0 });
  return economy.get(k);
}

function getLevel(guildId, userId) {
  const k = key(guildId, userId);
  if (!levels.has(k)) levels.set(k, { xp: 0, level: 1 });
  return levels.get(k);
}

function xpNeeded(level) {
  return level * 100;
}

function isAdmin(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function mentionId(text) {
  return text.match(/<@!?(\d+)>/)?.[1] || null;
}

function cleanAIJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); }
  catch { return null; }
}

// =========================
// GEMINI
// =========================
async function askAI(question) {
  try {
    const r = await ai.models.generateContent({
      model: MODEL,
      contents: question
    });
    return r.text || "No response.";
  } catch (e) {
    console.error("GEMINI ERROR:", e);
    return "❌ Gemini AI error. Check Render Logs.";
  }
}

async function understandAI(message) {
  const mentioned = mentionId(message.content);
  const prompt = `
You are Prime Development Studio AI, a friendly Discord server assistant.
You can answer normal questions and understand natural-language commands.

IMPORTANT:
- Return ONLY valid JSON.
- Never invent a Discord user ID.
- For admin actions, choose an action but the bot will perform permission checks.
- If information is missing, use action "answer" and ask a short clarification.
- Do not execute dangerous arbitrary Discord operations.
- Keep answers concise unless the user asks for detail.

Allowed actions:
answer
addcash, removecash, setcash
addxp, removexp, setxp, setlevel
reseteco, resetlevel
antilink_on, antilink_off
music_play, music_pause, music_resume, music_skip, music_stop, music_queue, music_volume

JSON:
{"action":"answer","answer":"..."}
or
{"action":"addcash","userId":"DISCORD_ID","amount":500,"answer":"..."}

User message: ${message.content}
Explicit mentioned user ID: ${mentioned || "none"}
`;

  const result = await askAI(prompt);
  return cleanAIJson(result) || { action: "answer", answer: result };
}

// =========================
// MUSIC SYSTEM
// =========================
function getMusic(guildId) {
  if (!music.has(guildId)) {
    music.set(guildId, {
      connection: null,
      player: createAudioPlayer(),
      queue: [],
      current: null,
      volume: 100,
      loop: false,
      textChannel: null
    });
  }
  return music.get(guildId);
}

async function playNext(guildId) {
  const m = getMusic(guildId);

  if (!m.queue.length) {
    m.current = null;
    return;
  }

  const song = m.queue.shift();
  m.current = song;

  try {
    const stream = await play.stream(song.url, {
      discordPlayerCompatibility: true
    });

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true
    });

    resource.volume?.setVolume(Math.max(0, Math.min(100, m.volume)) / 100);
    m.player.play(resource);

    if (m.textChannel) {
      m.textChannel.send(`🎵 **Now Playing:** **${song.title}**`).catch(() => {});
    }
  } catch (e) {
    console.error("MUSIC STREAM ERROR:", e);
    if (m.textChannel) {
      m.textChannel.send("❌ Is song ko play nahi kar paya, next song try kar raha hoon.").catch(() => {});
    }
    await playNext(guildId);
  }
}

async function musicPlay(message, query) {
  if (!message.guild) return "❌ Ye command server me use karo.";

  const voice = message.member?.voice?.channel;
  if (!voice) return "❌ Pehle voice channel join karo.";

  if (!query?.trim()) return "❌ Song name ya YouTube URL do.";

  const m = getMusic(message.guild.id);
  m.textChannel = message.channel;

  try {
    if (!m.connection) {
      m.connection = joinVoiceChannel({
        channelId: voice.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true
      });

      m.connection.subscribe(m.player);
      await entersState(m.connection, VoiceConnectionStatus.Ready, 20_000);
    }

    let song;

    if (/^https?:\/\//i.test(query)) {
      song = { title: query, url: query };
    } else {
      const results = await play.search(query, {
        limit: 1,
        source: { youtube: "video" }
      });

      if (!results.length) return "❌ Song nahi mila.";
      song = {
        title: results[0].title,
        url: results[0].url,
        duration: results[0].durationRaw
      };
    }

    m.queue.push(song);

    if (!m.current || m.player.state.status === AudioPlayerStatus.Idle) {
      await playNext(message.guild.id);
      return `🎵 **Playing:** ${song.title}`;
    }

    return `➕ Queue me add kiya: **${song.title}**`;
  } catch (e) {
    console.error("MUSIC ERROR:", e);
    return "❌ Music error. Render logs check karo.";
  }
}

function musicPause(guildId) {
  const m = getMusic(guildId);
  return m.player.pause() ? "⏸️ Music paused." : "❌ Music pause nahi ho paayi.";
}

function musicResume(guildId) {
  const m = getMusic(guildId);
  return m.player.unpause() ? "▶️ Music resumed." : "❌ Music resume nahi ho paayi.";
}

async function musicSkip(guildId) {
  const m = getMusic(guildId);
  if (!m.current) return "❌ Abhi kuch play nahi ho raha.";
  m.player.stop();
  return "⏭️ Skipped.";
}

async function musicStop(guildId) {
  const m = getMusic(guildId);
  m.queue = [];
  m.current = null;
  m.player.stop();

  if (m.connection) {
    m.connection.destroy();
    m.connection = null;
  }

  return "⏹️ Music stopped aur queue clear kar di.";
}

function musicQueue(guildId) {
  const m = getMusic(guildId);
  if (!m.current && !m.queue.length) return "📭 Queue empty hai.";

  let out = m.current ? `🎵 **Now:** ${m.current.title}\n` : "";
  if (m.queue.length) {
    out += m.queue.slice(0, 10).map((x, i) => `${i + 1}. ${x.title}`).join("\n");
    if (m.queue.length > 10) out += `\n...and ${m.queue.length - 10} more`;
  }
  return out;
}

function musicVolume(guildId, amount) {
  const m = getMusic(guildId);
  amount = Math.max(0, Math.min(100, Number(amount)));
  m.volume = amount;
  return `🔊 Volume **${amount}%** set.`;
}

// =========================
// XP
// =========================
function addXP(guildId, userId, amount = 10) {
  const d = getLevel(guildId, userId);
  d.xp += amount;

  let leveled = false;
  while (d.xp >= xpNeeded(d.level)) {
    d.xp -= xpNeeded(d.level);
    d.level++;
    leveled = true;
  }
  return { ...d, leveled };
}

// =========================
// AI ACTION EXECUTION
// =========================
async function executeAIAction(message, data) {
  const guildId = message.guild.id;
  const action = data.action;

  const adminActions = new Set([
    "addcash", "removecash", "setcash",
    "addxp", "removexp", "setxp", "setlevel",
    "reseteco", "resetlevel",
    "antilink_on", "antilink_off"
  ]);

  if (adminActions.has(action) && !isAdmin(message.member)) {
    return "🔒 Is action ke liye **Administrator** permission chahiye.";
  }

  if (action === "answer") return data.answer || "Batao bhai, kya help chahiye?";

  if (["addcash","removecash","setcash","addxp","removexp","setxp","setlevel","reseteco","resetlevel"].includes(action)) {
    const userId = data.userId || mentionId(message.content);
    if (!userId) return "❌ User mention karo.";
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (!member) return "❌ User server me nahi mila.";

    const amount = Number(data.amount);
    const level = Number(data.level);

    if (action === "addcash") {
      if (!Number.isFinite(amount) || amount <= 0) return "❌ Valid cash amount do.";
      getEco(guildId, userId).cash += amount;
      return `💰 ${member} ko **${amount} cash** add kiya.`;
    }

    if (action === "removecash") {
      if (!Number.isFinite(amount) || amount <= 0) return "❌ Valid cash amount do.";
      const e = getEco(guildId, userId);
      e.cash = Math.max(0, e.cash - amount);
      return `💸 ${member} se **${amount} cash** remove kiya.`;
    }

    if (action === "setcash") {
      if (!Number.isFinite(amount) || amount < 0) return "❌ Valid cash amount do.";
      getEco(guildId, userId).cash = amount;
      return `💰 ${member} ka cash **${amount}** set kiya.`;
    }

    if (action === "addxp") {
      if (!Number.isFinite(amount) || amount <= 0) return "❌ Valid XP amount do.";
      const r = addXP(guildId, userId, amount);
      return `✨ ${member} ko **${amount} XP** add kiya. Level: **${r.level}**`;
    }

    if (action === "removexp") {
      if (!Number.isFinite(amount) || amount <= 0) return "❌ Valid XP amount do.";
      const d = getLevel(guildId, userId);
      d.xp = Math.max(0, d.xp - amount);
      return `✨ ${member} se **${amount} XP** remove kiya.`;
    }

    if (action === "setxp") {
      if (!Number.isFinite(amount) || amount < 0) return "❌ Valid XP amount do.";
      const d = getLevel(guildId, userId);
      d.xp = amount;
      while (d.xp >= xpNeeded(d.level)) {
        d.xp -= xpNeeded(d.level);
        d.level++;
      }
      return `✨ ${member} ka XP **${amount}** set kiya.`;
    }

    if (action === "setlevel") {
      if (!Number.isInteger(level) || level < 1 || level > 1000) return "❌ Level 1-1000 ke beech hona chahiye.";
      const d = getLevel(guildId, userId);
      d.level = level;
      d.xp = 0;
      return `🏆 ${member} ka level **${level}** set kiya.`;
    }

    if (action === "reseteco") {
      economy.set(key(guildId, userId), { cash: 0 });
      return `♻️ ${member} ka economy reset kar diya.`;
    }

    if (action === "resetlevel") {
      levels.set(key(guildId, userId), { xp: 0, level: 1 });
      return `♻️ ${member} ka level reset kar diya.`;
    }
  }

  if (action === "antilink_on") {
    antiLinkServers.add(guildId);
    return "🛡️ Anti-Link **ON** kar diya.";
  }

  if (action === "antilink_off") {
    antiLinkServers.delete(guildId);
    return "🛡️ Anti-Link **OFF** kar diya.";
  }

  if (action === "music_play") return musicPlay(message, data.query || message.content);
  if (action === "music_pause") return musicPause(guildId);
  if (action === "music_resume") return musicResume(guildId);
  if (action === "music_skip") return musicSkip(guildId);
  if (action === "music_stop") return musicStop(guildId);
  if (action === "music_queue") return musicQueue(guildId);
  if (action === "music_volume") return musicVolume(guildId, data.amount);

  return "❌ Ye action available nahi hai.";
}

// =========================
// COMMANDS
// =========================
const commands = [
  new SlashCommandBuilder().setName("ai").setDescription("Ask Prime AI").addStringOption(o => o.setName("question").setDescription("Question").setRequired(true)),
  new SlashCommandBuilder().setName("setaichannel").setDescription("Set AI channel").addChannelOption(o => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("removeaichannel").setDescription("Remove AI channel"),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Server information"),
  new SlashCommandBuilder().setName("userinfo").setDescription("User information").addUserOption(o => o.setName("user").setDescription("User")),
  new SlashCommandBuilder().setName("avatar").setDescription("Show avatar").addUserOption(o => o.setName("user").setDescription("User")),
  new SlashCommandBuilder().setName("announce").setDescription("Send announcement").addStringOption(o => o.setName("message").setDescription("Message").setRequired(true)),
  new SlashCommandBuilder().setName("setwelcome").setDescription("Set welcome channel").addChannelOption(o => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("removewelcome").setDescription("Remove welcome"),
  new SlashCommandBuilder().setName("antilink").setDescription("Anti link").addStringOption(o => o.setName("mode").setDescription("on/off").setRequired(true).addChoices({name:"on",value:"on"},{name:"off",value:"off"})),
  new SlashCommandBuilder().setName("rank").setDescription("Show rank").addUserOption(o => o.setName("user").setDescription("User")),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Show XP leaderboard"),
  new SlashCommandBuilder().setName("balance").setDescription("Show cash").addUserOption(o => o.setName("user").setDescription("User")),
  new SlashCommandBuilder().setName("daily").setDescription("Claim daily cash"),
  new SlashCommandBuilder().setName("pay").setDescription("Pay user").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("addcash").setDescription("Admin: add cash").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("removecash").setDescription("Admin: remove cash").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("setcash").setDescription("Admin: set cash").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(0).setRequired(true)),
  new SlashCommandBuilder().setName("addxp").setDescription("Admin: add XP").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("XP").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("removexp").setDescription("Admin: remove XP").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("XP").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("setxp").setDescription("Admin: set XP").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("XP").setMinValue(0).setRequired(true)),
  new SlashCommandBuilder().setName("setlevel").setDescription("Admin: set level").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("level").setDescription("Level").setMinValue(1).setMaxValue(1000).setRequired(true)),
  new SlashCommandBuilder().setName("reseteco").setDescription("Admin: reset economy").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder().setName("resetlevel").setDescription("Admin: reset level").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder().setName("play").setDescription("Play music").addStringOption(o => o.setName("query").setDescription("Song or YouTube URL").setRequired(true)),
  new SlashCommandBuilder().setName("pause").setDescription("Pause music"),
  new SlashCommandBuilder().setName("resume").setDescription("Resume music"),
  new SlashCommandBuilder().setName("skip").setDescription("Skip song"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop music"),
  new SlashCommandBuilder().setName("queue").setDescription("Show music queue"),
  new SlashCommandBuilder().setName("volume").setDescription("Set music volume").addIntegerOption(o => o.setName("amount").setDescription("0-100").setMinValue(0).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("help").setDescription("Show help")
].map(x => x.toJSON());

// =========================
// READY
// =========================
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Slash commands registered.");
  } catch (e) {
    console.error("COMMAND REGISTER ERROR:", e);
  }
});

// =========================
// INTERACTIONS
// =========================
client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;
      const guildId = interaction.guildId;

      if (name === "ai") {
        await interaction.deferReply();
        return interaction.editReply(await askAI(interaction.options.getString("question")));
      }

      if (name === "setaichannel") {
        if (!isAdmin(interaction.member)) return interaction.reply({content:"🔒 Administrator required.",ephemeral:true});
        aiChannels.set(guildId, interaction.options.getChannel("channel").id);
        return interaction.reply(`🤖 AI channel set to <#${aiChannels.get(guildId)}>`);
      }

      if (name === "removeaichannel") {
        if (!isAdmin(interaction.member)) return interaction.reply({content:"🔒 Administrator required.",ephemeral:true});
        aiChannels.delete(guildId);
        return interaction.reply("🤖 AI channel removed.");
      }

      if (name === "serverinfo") {
        const g = interaction.guild;
        return interaction.reply({embeds:[new EmbedBuilder().setTitle(`📊 ${g.name}`).addFields(
          {name:"Members",value:String(g.memberCount),inline:true},
          {name:"Channels",value:String(g.channels.cache.size),inline:true},
          {name:"Roles",value:String(g.roles.cache.size),inline:true}
        )]});
      }

      if (name === "userinfo") {
        const u = interaction.options.getUser("user") || interaction.user;
        const m = await interaction.guild.members.fetch(u.id).catch(()=>null);
        return interaction.reply({embeds:[new EmbedBuilder().setTitle("👤 User Info").setThumbnail(u.displayAvatarURL()).addFields(
          {name:"User",value:`${u}`,inline:true},
          {name:"ID",value:u.id,inline:true},
          {name:"Joined",value:m?.joinedAt ? `<t:${Math.floor(m.joinedAt.getTime()/1000)}:R>` : "Unknown",inline:true}
        )]});
      }

      if (name === "avatar") {
        const u = interaction.options.getUser("user") || interaction.user;
        return interaction.reply(u.displayAvatarURL({size:1024}));
      }

      if (name === "announce") {
        if (!isAdmin(interaction.member)) return interaction.reply({content:"🔒 Administrator required.",ephemeral:true});
        return interaction.reply(`📢 **ANNOUNCEMENT**\n${interaction.options.getString("message")}`);
      }

      if (name === "setwelcome") {
        if (!isAdmin(interaction.member)) return interaction.reply({content:"🔒 Administrator required.",ephemeral:true});
        const c = interaction.options.getChannel("channel");
        welcomeChannels.set(guildId, c.id);
        return interaction.reply(`👋 Welcome channel set to ${c}.`);
      }

      if (name === "removewelcome") {
        if (!isAdmin(interaction.member)) return interaction.reply({content:"🔒 Administrator required.",ephemeral:true});
        welcomeChannels.delete(guildId);
        return interaction.reply("👋 Welcome disabled.");
      }

      if (name === "antilink") {
        if (!isAdmin(interaction.member)) return interaction.reply({content:"🔒 Administrator required.",ephemeral:true});
        const mode = interaction.options.getString("mode");
        mode === "on" ? antiLinkServers.add(guildId) : antiLinkServers.delete(guildId);
        return interaction.reply(`🛡️ Anti-Link **${mode.toUpperCase()}**.`);
      }

      if (name === "rank") {
        const u = interaction.options.getUser("user") || interaction.user;
        const d = getLevel(guildId, u.id);
        return interaction.reply(`🏆 ${u} — Level **${d.level}**, XP **${d.xp}/${xpNeeded(d.level)}**`);
      }

      if (name === "leaderboard") {
        const rows = [...levels.entries()].filter(([k])=>k.startsWith(guildId+":"))
          .map(([k,v])=>({id:k.split(":")[1],...v}))
          .sort((a,b)=>b.level-a.level || b.xp-a.xp).slice(0,10);
        const text = rows.length ? rows.map((x,i)=>`${i+1}. <@${x.id}> — Lv.${x.level} (${x.xp} XP)`).join("\n") : "No XP data.";
        return interaction.reply(`🏆 **XP Leaderboard**\n${text}`);
      }

      if (name === "balance") {
        const u = interaction.options.getUser("user") || interaction.user;
        return interaction.reply(`💰 ${u} has **${getEco(guildId,u.id).cash} cash**.`);
      }

      if (name === "daily") {
        const k = key(guildId, interaction.user.id);
        const now = Date.now();
        if (dailyCooldown.get(k) > now) {
          const left = Math.ceil((dailyCooldown.get(k)-now)/3600000);
          return interaction.reply(`⏳ Daily already claimed. Try again in about **${left}h**.`);
        }
        dailyCooldown.set(k, now + 86400000);
        getEco(guildId, interaction.user.id).cash += 1000;
        return interaction.reply("🎁 Daily reward: **1000 cash**!");
      }

      if (name === "pay") {
        const u = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const from = getEco(guildId, interaction.user.id);
        if (from.cash < amount) return interaction.reply("❌ Insufficient cash.");
        from.cash -= amount;
        getEco(guildId,u.id).cash += amount;
        return interaction.reply(`💸 Paid **${amount} cash** to ${u}.`);
      }

      const adminMap = {
        addcash:"addcash", removecash:"removecash", setcash:"setcash",
        addxp:"addxp", removexp:"removexp", setxp:"setxp",
        setlevel:"setlevel", reseteco:"reseteco", resetlevel:"resetlevel"
      };

      if (adminMap[name]) {
        if (!isAdmin(interaction.member)) return interaction.reply({content:"🔒 Administrator required.",ephemeral:true});
        const u = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const level = interaction.options.getInteger("level");
        const fake = {guild:{id:guildId},member:interaction.member,content:`<@${u.id}>`};
        const result = await executeAIAction(fake,{action:adminMap[name],userId:u.id,amount,level});
        return interaction.reply(result);
      }

      if (name === "play") return interaction.reply(await musicPlay(interaction, interaction.options.getString("query")));
      if (name === "pause") return interaction.reply(musicPause(guildId));
      if (name === "resume") return interaction.reply(musicResume(guildId));
      if (name === "skip") return interaction.reply(await musicSkip(guildId));
      if (name === "stop") return interaction.reply(await musicStop(guildId));
      if (name === "queue") return interaction.reply(musicQueue(guildId));
      if (name === "volume") return interaction.reply(musicVolume(guildId, interaction.options.getInteger("amount")));

      if (name === "help") {
        return interaction.reply(`🤖 **Prime Development Studio AI v5**

**AI**
/ai • /setaichannel • /removeaichannel

**Economy & XP**
/balance • /daily • /pay • /rank • /leaderboard
Admin: /addcash /removecash /setcash /addxp /removexp /setxp /setlevel /reseteco /resetlevel

**Moderation**
/antilink • /announce • /setwelcome • /removewelcome

**Music**
/play • /pause • /resume • /skip • /stop • /queue • /volume

You can also talk naturally in the AI channel, e.g.
"Arsh ko 500 cash de do"
"anti link on kar"
"play Believer"
"queue dikhao"
"JavaScript kya hai?"`);
      }
    }
  } catch (e) {
    console.error("INTERACTION ERROR:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({content:"❌ Something went wrong.",ephemeral:true}).catch(()=>{});
    }
  }
});

// =========================
// MUSIC EVENTS
// =========================
client.on("ready", () => {
  for (const m of music.values()) {
    m.player.on(AudioPlayerStatus.Idle, async () => {
      if (m.current) {
        m.current = null;
        await playNext([...music.entries()].find(([,v])=>v===m)?.[0]);
      }
    });
  }
});

// =========================
// MESSAGES
// =========================
client.on("guildMemberAdd", async member => {
  const channelId = welcomeChannels.get(member.guild.id);
  if (!channelId) return;
  const ch = member.guild.channels.cache.get(channelId);
  if (!ch) return;
  ch.send(`👋 Welcome ${member} to **${member.guild.name}**! Have fun and read the rules.`);
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  if (antiLinkServers.has(message.guild.id) && /https?:\/\/|www\./i.test(message.content)) {
    if (!isAdmin(message.member)) {
      await message.delete().catch(()=>{});
      return message.channel.send(`${message.author} ❌ Links are not allowed here.`)
        .then(x=>setTimeout(()=>x.delete().catch(()=>{}),4000)).catch(()=>{});
    }
  }

  const r = addXP(message.guild.id, message.author.id, 10);
  if (r.leveled) {
    message.channel.send(`🎉 ${message.author} reached **Level ${r.level}**!`).catch(()=>{});
  }

  const aiChannel = aiChannels.get(message.guild.id);
  if (aiChannel && message.channel.id === aiChannel) {
    await message.channel.sendTyping().catch(()=>{});
    const result = await understandAI(message);

    if (result.action === "answer") {
      return message.reply(result.answer || "Batao bhai.");
    }

    const output = await executeAIAction(message, result);
    return message.reply(output);
  }
});

// =========================
// LOGIN
// =========================
client.login(TOKEN);
