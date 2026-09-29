require("dotenv").config();

const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState
} = require("@discordjs/voice");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@libsql/client");
const play = require("play-dl");
const express = require("express");

// ============================================================
// PRIME DEVELOPMENT STUDIO AI V6
// MongoDB-free. Persistent data uses Turso/libSQL.
// ============================================================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const MODEL = "gemini-3.8-flash";

if (!TOKEN || !CLIENT_ID || !GEMINI_API_KEY) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID or GEMINI_API_KEY");
  process.exit(1);
}
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.");
  console.error("V6 requires Turso/libSQL so Render restarts do not wipe data.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

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
app.get("/", (_, res) => res.send("Prime Development Studio AI V6 is online."));
app.get("/health", (_, res) => res.json({ ok: true, bot: client.user?.tag || null }));
app.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("Web server online."));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();
const isAdmin = member => !!member?.permissions?.has(PermissionFlagsBits.Administrator);

async function sql(sql, args = []) {
  return db.execute({ sql, args });
}
async function initDB() {
  await sql(`CREATE TABLE IF NOT EXISTS guild_settings(
    guild_id TEXT PRIMARY KEY, ai_channel_id TEXT, welcome_channel_id TEXT,
    log_channel_id TEXT, autorole_id TEXT, anti_link INTEGER DEFAULT 0,
    automod INTEGER DEFAULT 0
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS users(
    guild_id TEXT, user_id TEXT, cash INTEGER DEFAULT 0, xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1, daily_at INTEGER DEFAULT 0, warnings INTEGER DEFAULT 0,
    PRIMARY KEY(guild_id,user_id)
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS tickets(
    channel_id TEXT PRIMARY KEY, guild_id TEXT, user_id TEXT, created_at INTEGER
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS giveaways(
    message_id TEXT PRIMARY KEY, guild_id TEXT, channel_id TEXT, prize TEXT,
    winners INTEGER, ends_at INTEGER, ended INTEGER DEFAULT 0
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS giveaway_entries(
    message_id TEXT, user_id TEXT, PRIMARY KEY(message_id,user_id)
  )`);
  console.log("Database initialized.");
}
async function ensureUser(guildId, userId) {
  await sql(`INSERT OR IGNORE INTO users(guild_id,user_id) VALUES(?,?)`, [guildId,userId]);
}
async function getUser(guildId,userId) {
  await ensureUser(guildId,userId);
  return (await sql(`SELECT * FROM users WHERE guild_id=? AND user_id=?`, [guildId,userId])).rows[0];
}
async function getSettings(guildId) {
  await sql(`INSERT OR IGNORE INTO guild_settings(guild_id) VALUES(?)`, [guildId]);
  return (await sql(`SELECT * FROM guild_settings WHERE guild_id=?`, [guildId])).rows[0];
}
async function setSetting(guildId, key, value) {
  await getSettings(guildId);
  const allowed = new Set(["ai_channel_id","welcome_channel_id","log_channel_id","autorole_id","anti_link","automod"]);
  if (!allowed.has(key)) throw new Error("Invalid setting");
  await sql(`UPDATE guild_settings SET ${key}=? WHERE guild_id=?`, [value, guildId]);
}
function levelForXP(xp) { return Math.max(1, Math.floor(Math.sqrt(Math.max(0,xp)/100)) + 1); }

async function logAction(guild, title, description) {
  try {
    const s = await getSettings(guild.id);
    if (!s.log_channel_id) return;
    const ch = await guild.channels.fetch(s.log_channel_id).catch(()=>null);
    if (ch?.isTextBased()) await ch.send({embeds:[new EmbedBuilder().setTitle(title).setDescription(description).setTimestamp()]});
  } catch {}
}

// ---------- Gemini with retry / overload protection ----------
function retryable(err) {
  const status = err?.status || err?.error?.code || err?.code;
  const msg = String(err?.message || "").toLowerCase();
  return status === 429 || status === 500 || status === 502 || status === 503 ||
         msg.includes("high demand") || msg.includes("unavailable") || msg.includes("overloaded") ||
         msg.includes("resource exhausted");
}
async function askAI(prompt) {
  let last;
  for (let attempt=0; attempt<4; attempt++) {
    try {
      const r = await ai.models.generateContent({ model: MODEL, contents: prompt });
      return r.text || "I couldn't generate a response.";
    } catch (e) {
      last = e;
      console.error(`GEMINI attempt ${attempt+1}:`, e?.message || e);
      if (!retryable(e) || attempt === 3) break;
      await sleep(1000 * Math.pow(2, attempt) + Math.floor(Math.random()*500));
    }
  }
  return "⚠️ Gemini is temporarily busy. Please try again in a few seconds.";
}

async function parseAIAction(text) {
  const prompt = `You are the command router for a Discord bot.
Return ONLY one valid JSON object, no markdown.
Allowed actions:
answer, addcash, removecash, setcash, addxp, removexp, setxp, setlevel,
reseteco, resetlevel, antilink_on, antilink_off.
For economy/xp actions use { "action":"...", "user":"username or mention or me", "amount":number }.
For level use amount as level.
For answer use { "action":"answer", "reply":"..." }.
For anti-link use only action.
Never invent an amount. If the request is ambiguous or needs a target not identifiable, use answer and explain what is needed.
User request: ${text}`;
  const raw = await askAI(prompt);
  try {
    const clean = raw.replace(/```json|```/g,"").trim();
    return JSON.parse(clean);
  } catch {
    return { action:"answer", reply:raw };
  }
}
async function findMember(message, target) {
  if (!target || target === "me") return message.member;
  const mention = target.match(/^<@!?(\d+)>$/);
  if (mention) return message.guild.members.fetch(mention[1]).catch(()=>null);
  const q = target.toLowerCase().replace(/^@/,"");
  return message.guild.members.fetch().then(ms => ms.find(m =>
    m.user.username.toLowerCase()===q || m.displayName.toLowerCase()===q
  )).catch(()=>null);
}
async function executeAIAction(message, data) {
  const adminActions = new Set(["addcash","removecash","setcash","addxp","removexp","setxp","setlevel","reseteco","resetlevel","antilink_on","antilink_off"]);
  if (adminActions.has(data.action) && !isAdmin(message.member))
    return "❌ Administrator permission required for that action.";

  if (data.action === "answer") return data.reply || "Ask me anything.";
  if (["antilink_on","antilink_off"].includes(data.action)) {
    await setSetting(message.guild.id, "anti_link", data.action === "antilink_on" ? 1 : 0);
    return `✅ Anti-link ${data.action.endsWith("on") ? "enabled" : "disabled"}.`;
  }
  const target = await findMember(message, data.user);
  if (!target) return "❌ I couldn't find that member.";
  await ensureUser(message.guild.id,target.id);
  const amount = Math.max(0, Math.floor(Number(data.amount)||0));
  if (["addcash","removecash","setcash"].includes(data.action)) {
    const u = await getUser(message.guild.id,target.id);
    let cash = u.cash;
    if (data.action==="addcash") cash += amount;
    if (data.action==="removecash") cash = Math.max(0,cash-amount);
    if (data.action==="setcash") cash = amount;
    await sql(`UPDATE users SET cash=? WHERE guild_id=? AND user_id=?`,[cash,message.guild.id,target.id]);
    return `✅ <@${target.id}> now has **${cash.toLocaleString()}** coins.`;
  }
  if (["addxp","removexp","setxp"].includes(data.action)) {
    const u = await getUser(message.guild.id,target.id);
    let xp = u.xp;
    if (data.action==="addxp") xp += amount;
    if (data.action==="removexp") xp = Math.max(0,xp-amount);
    if (data.action==="setxp") xp = amount;
    const level = levelForXP(xp);
    await sql(`UPDATE users SET xp=?,level=? WHERE guild_id=? AND user_id=?`,[xp,level,message.guild.id,target.id]);
    return `✅ <@${target.id}>: **${xp} XP**, Level **${level}**.`;
  }
  if (data.action==="setlevel") {
    const level = Math.max(1,amount);
    await sql(`UPDATE users SET level=? WHERE guild_id=? AND user_id=?`,[level,message.guild.id,target.id]);
    return `✅ <@${target.id}> level set to **${level}**.`;
  }
  if (data.action==="reseteco") {
    await sql(`UPDATE users SET cash=0,daily_at=0 WHERE guild_id=? AND user_id=?`,[message.guild.id,target.id]);
    return `✅ Economy reset for <@${target.id}>.`;
  }
  if (data.action==="resetlevel") {
    await sql(`UPDATE users SET xp=0,level=1 WHERE guild_id=? AND user_id=?`,[message.guild.id,target.id]);
    return `✅ Level reset for <@${target.id}>.`;
  }
  return "❓ I don't know that command yet.";
}

// ---------- Music ----------
const music = new Map();
function state(guildId) {
  if (!music.has(guildId)) {
    const player = createAudioPlayer();
    const s = { player, connection:null, queue:[], current:null, volume:1 };
    player.on(AudioPlayerStatus.Idle, () => playNext(guildId).catch(console.error));
    player.on("error", e => { console.error("Music:",e); playNext(guildId).catch(()=>{}); });
    music.set(guildId,s);
  }
  return music.get(guildId);
}
async function connectVoice(guild, member) {
  const vc = member.voice.channel;
  if (!vc) throw new Error("Join a voice channel first.");
  const s=state(guild.id);
  s.connection=joinVoiceChannel({channelId:vc.id,guildId:guild.id,adapterCreator:guild.voiceAdapterCreator});
  await entersState(s.connection, VoiceConnectionStatus.Ready, 15000);
  s.connection.subscribe(s.player);
  return s;
}
async function playNext(guildId) {
  const s=state(guildId);
  const item=s.queue.shift();
  if (!item) { s.current=null; return; }
  s.current=item;
  try {
    const stream=await play.stream(item.url,{discordPlayerCompatibility:true});
    const resource=createAudioResource(stream.stream,{inputType:stream.type,inlineVolume:true});
    resource.volume?.setVolume(s.volume);
    s.player.play(resource);
  } catch(e) {
    console.error("Stream error:",e?.message||e);
    s.current=null;
    setTimeout(()=>playNext(guildId),300);
  }
}
async function musicPlay(guild, member, query) {
  const s=await connectVoice(guild,member);
  let url=query;
  if (!/^https?:\/\//i.test(query)) {
    const results=await play.search(query,{limit:1});
    if (!results.length) throw new Error("No result found.");
    url=results[0].url;
  }
  s.queue.push({url,title:query});
  if (s.player.state.status!==AudioPlayerStatus.Playing && !s.current) await playNext(guild.id);
  return `🎵 Added **${query}** to the queue.`;
}

// ---------- Slash commands ----------
const commands = [
 new SlashCommandBuilder().setName("ai").setDescription("Ask Prime AI").addStringOption(o=>o.setName("question").setDescription("Question").setRequired(true)),
 new SlashCommandBuilder().setName("help").setDescription("Show bot features"),
 new SlashCommandBuilder().setName("serverinfo").setDescription("Server information"),
 new SlashCommandBuilder().setName("userinfo").setDescription("User information").addUserOption(o=>o.setName("user").setDescription("User")),
 new SlashCommandBuilder().setName("avatar").setDescription("Show avatar").addUserOption(o=>o.setName("user").setDescription("User")),
 new SlashCommandBuilder().setName("setaichannel").setDescription("Set AI channel").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("removeaichannel").setDescription("Remove AI channel").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("setwelcome").setDescription("Set welcome channel").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("removewelcome").setDescription("Remove welcome channel").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("setlogs").setDescription("Set log channel").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("autorole").setDescription("Set autorole").addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("antilink").setDescription("Anti-link").addStringOption(o=>o.setName("mode").setDescription("on/off").setRequired(true).addChoices({name:"on",value:"on"},{name:"off",value:"off"})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("automod").setDescription("Basic automod").addStringOption(o=>o.setName("mode").setDescription("on/off").setRequired(true).addChoices({name:"on",value:"on"},{name:"off",value:"off"})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("ban").setDescription("Ban a member").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason")),
 new SlashCommandBuilder().setName("kick").setDescription("Kick a member").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason")),
 new SlashCommandBuilder().setName("timeout").setDescription("Timeout member").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o=>o.setName("minutes").setDescription("Minutes").setRequired(true).setMinValue(1).setMaxValue(40320)),
 new SlashCommandBuilder().setName("warn").setDescription("Warn member").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason")),
 new SlashCommandBuilder().setName("warnings").setDescription("Show warnings").addUserOption(o=>o.setName("user").setDescription("User")),
 new SlashCommandBuilder().setName("clear").setDescription("Delete messages").addIntegerOption(o=>o.setName("amount").setDescription("1-100").setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
 new SlashCommandBuilder().setName("lock").setDescription("Lock channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
 new SlashCommandBuilder().setName("unlock").setDescription("Unlock channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
 new SlashCommandBuilder().setName("balance").setDescription("Check balance").addUserOption(o=>o.setName("user").setDescription("User")),
 new SlashCommandBuilder().setName("daily").setDescription("Daily coins"),
 new SlashCommandBuilder().setName("work").setDescription("Work for coins"),
 new SlashCommandBuilder().setName("crime").setDescription("Risky crime for coins"),
 new SlashCommandBuilder().setName("pay").setDescription("Pay coins").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o=>o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1)),
 new SlashCommandBuilder().setName("addcash").setDescription("Admin add coins").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o=>o.setName("amount").setDescription("Amount").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("removecash").setDescription("Admin remove coins").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o=>o.setName("amount").setDescription("Amount").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("setcash").setDescription("Admin set coins").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o=>o.setName("amount").setDescription("Amount").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName("rank").setDescription("Show rank").addUserOption(o=>o.setName("user").setDescription("User")),
 new SlashCommandBuilder().setName("leaderboard").setDescription("XP leaderboard"),
 new SlashCommandBuilder().setName("ticket").setDescription("Create a ticket"),
 new SlashCommandBuilder().setName("giveaway").setDescription("Create giveaway").addIntegerOption(o=>o.setName("minutes").setDescription("Minutes").setRequired(true).setMinValue(1)).addIntegerOption(o=>o.setName("winners").setDescription("Winners").setRequired(true).setMinValue(1).setMaxValue(20)).addStringOption(o=>o.setName("prize").setDescription("Prize").setRequired(true)),
 new SlashCommandBuilder().setName("play").setDescription("Play music").addStringOption(o=>o.setName("query").setDescription("Song or URL").setRequired(true)),
 new SlashCommandBuilder().setName("pause").setDescription("Pause music"),
 new SlashCommandBuilder().setName("resume").setDescription("Resume music"),
 new SlashCommandBuilder().setName("skip").setDescription("Skip song"),
 new SlashCommandBuilder().setName("stop").setDescription("Stop music"),
 new SlashCommandBuilder().setName("queue").setDescription("Show music queue"),
 new SlashCommandBuilder().setName("volume").setDescription("Set volume").addIntegerOption(o=>o.setName("amount").setDescription("1-100").setRequired(true).setMinValue(1).setMaxValue(100))
].map(x=>x.toJSON());

async function registerCommands() {
  const rest=new REST({version:"10"}).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands});
  console.log(`Registered ${commands.length} slash commands.`);
}

async function handleModeration(interaction) {
  const cmd=interaction.commandName;
  if (["ban","kick","timeout","warn"].includes(cmd) && !isAdmin(interaction.member))
    return interaction.reply({content:"❌ Administrator permission required.",ephemeral:true});
  const target=interaction.options.getMember("user");
  if (cmd!=="warn" && !target) return interaction.reply({content:"❌ Member not found.",ephemeral:true});
  const reason=interaction.options.getString("reason") || "No reason provided";
  if (cmd==="ban") await target.ban({reason}), await interaction.reply(`🔨 Banned **${target.user.tag}** — ${reason}`);
  if (cmd==="kick") await target.kick(reason), await interaction.reply(`👢 Kicked **${target.user.tag}** — ${reason}`);
  if (cmd==="timeout") await target.timeout(interaction.options.getInteger("minutes")*60000,reason), await interaction.reply(`⏱️ Timed out **${target.user.tag}**.`);
  if (cmd==="warn") {
    const u=await getUser(interaction.guild.id,target.id);
    await sql(`UPDATE users SET warnings=warnings+1 WHERE guild_id=? AND user_id=?`,[interaction.guild.id,target.id]);
    const n=u.warnings+1;
    await interaction.reply(`⚠️ <@${target.id}> warned. Total warnings: **${n}**.`);
  }
  await logAction(interaction.guild,`Moderation: ${cmd}`,`${interaction.user} used ${cmd} on ${target}`);
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId==="ticket_create") {
        const existing=(await sql(`SELECT * FROM tickets WHERE guild_id=? AND user_id=?`,[interaction.guild.id,interaction.user.id])).rows[0];
        if (existing) return interaction.reply({content:`❌ You already have <#${existing.channel_id}>.`,ephemeral:true});
        const ch=await interaction.guild.channels.create({
          name:`ticket-${interaction.user.username}`.slice(0,90),
          type:ChannelType.GuildText,
          permissionOverwrites:[
            {id:interaction.guild.id,deny:[PermissionFlagsBits.ViewChannel]},
            {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
            {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels]}
          ]
        });
        await sql(`INSERT INTO tickets VALUES(?,?,?,?)`,[ch.id,interaction.guild.id,interaction.user.id,now()]);
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger));
        await ch.send({content:`🎫 Welcome <@${interaction.user.id}>!`,components:[row]});
        return interaction.reply({content:`✅ Ticket created: ${ch}`,ephemeral:true});
      }
      if (interaction.customId==="ticket_close") {
        await sql(`DELETE FROM tickets WHERE channel_id=?`,[interaction.channel.id]);
        await interaction.reply("🔒 Closing ticket...");
        setTimeout(()=>interaction.channel.delete().catch(()=>{}),1500);
        return;
      }
      if (interaction.customId.startsWith("giveaway:")) {
        const id=interaction.customId.split(":")[1];
        await sql(`INSERT OR IGNORE INTO giveaway_entries VALUES(?,?)`,[id,interaction.user.id]);
        return interaction.reply({content:"🎉 You entered the giveaway!",ephemeral:true});
      }
    }
    if (!interaction.isChatInputCommand()) return;
    const c=interaction.commandName;

    if (["ban","kick","timeout","warn"].includes(c)) return handleModeration(interaction);
    if (c==="ai") return interaction.reply({content:await askAI(interaction.options.getString("question"))});
    if (c==="help") {
      const e=new EmbedBuilder().setTitle("🤖 Prime Development Studio AI V6").setDescription(
        "**AI:** `/ai` • AI channel • natural language actions\n"+
        "**Moderation:** `/ban` `/kick` `/timeout` `/warn` `/clear` `/lock` `/unlock` `/antilink` `/automod`\n"+
        "**Economy:** `/balance` `/daily` `/work` `/crime` `/pay` `/addcash` `/removecash` `/setcash`\n"+
        "**Levels:** `/rank` `/leaderboard`\n"+
        "**Community:** `/ticket` `/giveaway` `/setwelcome` `/setlogs` `/autorole`\n"+
        "**Music:** `/play` `/pause` `/resume` `/skip` `/stop` `/queue` `/volume`"
      ); return interaction.reply({embeds:[e]});
    }
    if (c==="serverinfo") return interaction.reply({embeds:[new EmbedBuilder().setTitle(interaction.guild.name).addFields(
      {name:"Members",value:String(interaction.guild.memberCount),inline:true},{name:"Channels",value:String(interaction.guild.channels.cache.size),inline:true},{name:"Created",value:`<t:${Math.floor(interaction.guild.createdTimestamp/1000)}:D>`,inline:true})]});
    if (c==="userinfo") { const u=interaction.options.getUser("user")||interaction.user; return interaction.reply({embeds:[new EmbedBuilder().setTitle(u.tag).setThumbnail(u.displayAvatarURL()).addFields({name:"ID",value:u.id},{name:"Created",value:`<t:${Math.floor(u.createdTimestamp/1000)}:F>`})]}); }
    if (c==="avatar") { const u=interaction.options.getUser("user")||interaction.user; return interaction.reply(u.displayAvatarURL({size:1024})); }

    if (["setaichannel","removeaichannel","setwelcome","removewelcome","setlogs","autorole","antilink","automod"].includes(c)) {
      if (!isAdmin(interaction.member)) return interaction.reply({content:"❌ Administrator permission required.",ephemeral:true});
      if (c==="setaichannel") await setSetting(interaction.guild.id,"ai_channel_id",interaction.channel.id);
      if (c==="removeaichannel") await setSetting(interaction.guild.id,"ai_channel_id",null);
      if (c==="setwelcome") await setSetting(interaction.guild.id,"welcome_channel_id",interaction.channel.id);
      if (c==="removewelcome") await setSetting(interaction.guild.id,"welcome_channel_id",null);
      if (c==="setlogs") await setSetting(interaction.guild.id,"log_channel_id",interaction.channel.id);
      if (c==="autorole") await setSetting(interaction.guild.id,"autorole_id",interaction.options.getRole("role").id);
      if (c==="antilink") await setSetting(interaction.guild.id,"anti_link",interaction.options.getString("mode")==="on"?1:0);
      if (c==="automod") await setSetting(interaction.guild.id,"automod",interaction.options.getString("mode")==="on"?1:0);
      return interaction.reply(`✅ ${c} updated and saved permanently.`);
    }

    if (c==="clear") {
      const n=interaction.options.getInteger("amount"); await interaction.channel.bulkDelete(n,true); return interaction.reply({content:`🧹 Deleted ${n} messages.`,ephemeral:true});
    }
    if (c==="lock"||c==="unlock") {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone,{SendMessages:c==="unlock"?null:false});
      return interaction.reply(c==="lock"?"🔒 Channel locked.":"🔓 Channel unlocked.");
    }

    if (["balance","daily","work","crime","pay","addcash","removecash","setcash","rank","leaderboard"].includes(c)) {
      if (c==="leaderboard") {
        const rows=(await sql(`SELECT * FROM users WHERE guild_id=? ORDER BY xp DESC LIMIT 10`,[interaction.guild.id])).rows;
        return interaction.reply(rows.length ? rows.map((u,i)=>`${i+1}. <@${u.user_id}> — ${u.xp} XP • Lv ${u.level}`).join("\n") : "No XP data yet.");
      }
      const target=interaction.options.getUser("user")||interaction.user;
      await ensureUser(interaction.guild.id,target.id);
      if (c==="balance") { const u=await getUser(interaction.guild.id,target.id); return interaction.reply(`💰 <@${target.id}> has **${u.cash.toLocaleString()}** coins.`); }
      if (c==="daily") {
        const u=await getUser(interaction.guild.id,interaction.user.id); if(now()-u.daily_at<86400000) return interaction.reply(`⏳ Daily already claimed. Try again <t:${Math.floor((u.daily_at+86400000)/1000)}:R>.`);
        const reward=1000+Math.floor(Math.random()*1001); await sql(`UPDATE users SET cash=cash+?,daily_at=? WHERE guild_id=? AND user_id=?`,[reward,now(),interaction.guild.id,interaction.user.id]); return interaction.reply(`🎁 You received **${reward}** coins!`);
      }
      if (c==="work"||c==="crime") {
        const base=c==="work"?300:500; const reward=base+Math.floor(Math.random()*701); const success=c==="work"||Math.random()<0.65;
        if(success) { await sql(`UPDATE users SET cash=cash+? WHERE guild_id=? AND user_id=?`,[reward,interaction.guild.id,interaction.user.id]); return interaction.reply(`💵 You earned **${reward}** coins.`); }
        await sql(`UPDATE users SET cash=MAX(0,cash-?) WHERE guild_id=? AND user_id=?`,[reward,interaction.guild.id,interaction.user.id]); return interaction.reply(`🚨 Crime failed! You lost **${reward}** coins.`);
      }
      if(c==="pay") {
        const to=interaction.options.getUser("user"), amount=interaction.options.getInteger("amount"); if(to.bot||to.id===interaction.user.id) return interaction.reply("❌ Invalid target.");
        const me=await getUser(interaction.guild.id,interaction.user.id); if(me.cash<amount) return interaction.reply("❌ Not enough coins.");
        await ensureUser(interaction.guild.id,to.id); await sql(`UPDATE users SET cash=cash-? WHERE guild_id=? AND user_id=?`,[amount,interaction.guild.id,interaction.user.id]); await sql(`UPDATE users SET cash=cash+? WHERE guild_id=? AND user_id=?`,[amount,interaction.guild.id,to.id]); return interaction.reply(`💸 Paid **${amount}** coins to <@${to.id}>.`);
      }
      if(["addcash","removecash","setcash"].includes(c)) {
        if(!isAdmin(interaction.member)) return interaction.reply({content:"❌ Administrator permission required.",ephemeral:true});
        const amount=interaction.options.getInteger("amount"), to=interaction.options.getUser("user"); await ensureUser(interaction.guild.id,to.id);
        if(c==="addcash") await sql(`UPDATE users SET cash=cash+? WHERE guild_id=? AND user_id=?`,[amount,interaction.guild.id,to.id]);
        if(c==="removecash") await sql(`UPDATE users SET cash=MAX(0,cash-?) WHERE guild_id=? AND user_id=?`,[amount,interaction.guild.id,to.id]);
        if(c==="setcash") await sql(`UPDATE users SET cash=? WHERE guild_id=? AND user_id=?`,[amount,interaction.guild.id,to.id]);
        const u=await getUser(interaction.guild.id,to.id); return interaction.reply(`✅ <@${to.id}> now has **${u.cash}** coins.`);
      }
      if(c==="rank") { const u=await getUser(interaction.guild.id,target.id); return interaction.reply(`🏆 <@${target.id}> — Level **${u.level}**, XP **${u.xp}**.`); }
    }

    if(c==="ticket") {
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_create").setLabel("Create Ticket").setStyle(ButtonStyle.Primary));
      return interaction.reply({content:"🎫 Click below to open a private support ticket.",components:[row]});
    }
    if(c==="giveaway") {
      const minutes=interaction.options.getInteger("minutes"), winners=interaction.options.getInteger("winners"), prize=interaction.options.getString("prize");
      const end=now()+minutes*60000;
      const msg=await interaction.reply({content:`🎉 **GIVEAWAY**\nPrize: **${prize}**\nWinners: **${winners}**\nEnds: <t:${Math.floor(end/1000)}:R>`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("giveaway:pending").setLabel("🎉 Enter").setStyle(ButtonStyle.Success))],fetchReply:true});
      await sql(`INSERT INTO giveaways VALUES(?,?,?,?,?,?,0)`,[msg.id,interaction.guild.id,interaction.channel.id,prize,winners,end]);
      await interaction.editReply({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway:${msg.id}`).setLabel("🎉 Enter").setStyle(ButtonStyle.Success))]});
      return;
    }
    if(["play","pause","resume","skip","stop","queue","volume"].includes(c)) {
      const s=state(interaction.guild.id);
      if(c==="play") return interaction.reply(await musicPlay(interaction.guild,interaction.member,interaction.options.getString("query")));
      if(c==="pause") {s.player.pause(); return interaction.reply("⏸️ Paused.");}
      if(c==="resume") {s.player.unpause(); return interaction.reply("▶️ Resumed.");}
      if(c==="skip") {s.player.stop(); return interaction.reply("⏭️ Skipped.");}
      if(c==="stop") {s.queue=[];s.current=null;s.player.stop(); if(s.connection)s.connection.destroy();s.connection=null;return interaction.reply("⏹️ Stopped.");}
      if(c==="queue") return interaction.reply(s.current?`🎵 Now: **${s.current.title}**\n${s.queue.map((x,i)=>`${i+1}. ${x.title}`).join("\n")||"Queue empty."}`:"🎵 Nothing playing.");
      if(c==="volume") {s.volume=interaction.options.getInteger("amount")/100;return interaction.reply(`🔊 Volume set to **${interaction.options.getInteger("amount")}%**. It applies to the next track.`);}
    }
  } catch(e) {
    console.error("INTERACTION ERROR:",e);
    if(interaction.replied||interaction.deferred) interaction.followUp({content:"❌ Something went wrong. Check Render Logs.",ephemeral:true}).catch(()=>{});
    else interaction.reply({content:"❌ Something went wrong. Check Render Logs.",ephemeral:true}).catch(()=>{});
  }
});

// ---------- Messages / AI channel / moderation ----------
const xpCooldown=new Map();
client.on("messageCreate", async message => {
  if(!message.guild || message.author.bot) return;
  try {
    const s=await getSettings(message.guild.id);
    const hasLink=/(https?:\/\/|www\.|discord\.gg\/)/i.test(message.content);
    if(s.anti_link && hasLink && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(()=>{});
      await message.channel.send({content:`🚫 ${message.author}, links are not allowed here.`}).then(m=>setTimeout(()=>m.delete().catch(()=>{}),4000));
      return;
    }
    if(s.automod && /(discord\.gg\/|@everyone|@here)/i.test(message.content) && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(()=>{});
      return;
    }
    if(!xpCooldown.has(message.author.id)) {
      xpCooldown.set(message.author.id,now());
      await ensureUser(message.guild.id,message.author.id);
      const add=5+Math.floor(Math.random()*6);
      const u=await getUser(message.guild.id,message.author.id);
      const oldLevel=u.level, xp=u.xp+add, level=levelForXP(xp);
      await sql(`UPDATE users SET xp=?,level=? WHERE guild_id=? AND user_id=?`,[xp,level,message.guild.id,message.author.id]);
      if(level>oldLevel) message.channel.send(`🎉 ${message.author}, you reached **Level ${level}**!`).catch(()=>{});
      setTimeout(()=>xpCooldown.delete(message.author.id),60000);
    }
    if(s.ai_channel_id && message.channel.id===s.ai_channel_id) {
      await message.channel.sendTyping().catch(()=>{});
      const routed=await parseAIAction(message.content);
      const result=await executeAIAction(message,routed);
      return message.reply(result);
    }
  } catch(e) { console.error("MESSAGE ERROR:",e); }
});

client.on("guildMemberAdd", async member => {
  try {
    const s=await getSettings(member.guild.id);
    if(s.autorole_id) await member.roles.add(s.autorole_id).catch(()=>{});
    if(s.welcome_channel_id) {
      const ch=await member.guild.channels.fetch(s.welcome_channel_id).catch(()=>null);
      if(ch?.isTextBased()) await ch.send(`👋 Welcome ${member} to **${member.guild.name}**!`);
    }
  } catch(e){console.error(e);}
});

// Giveaway worker
setInterval(async()=>{
  try {
    const rows=(await sql(`SELECT * FROM giveaways WHERE ended=0 AND ends_at<=?`,[now()])).rows;
    for(const g of rows) {
      const entries=(await sql(`SELECT user_id FROM giveaway_entries WHERE message_id=?`,[g.message_id])).rows.map(x=>x.user_id);
      const shuffled=entries.sort(()=>Math.random()-0.5).slice(0,g.winners);
      const ch=await client.channels.fetch(g.channel_id).catch(()=>null);
      if(ch?.isTextBased()) {
        await ch.send(`🎊 **Giveaway ended!** Prize: **${g.prize}**\n${shuffled.length?`Winner(s): ${shuffled.map(x=>`<@${x}>`).join(", ")}`:"No valid entries."}`);
      }
      await sql(`UPDATE giveaways SET ended=1 WHERE message_id=?`,[g.message_id]);
    }
  } catch(e){console.error("GIVEAWAY WORKER:",e);}
},15000);

client.once("ready",()=>console.log(`Logged in as ${client.user.tag}`));

(async()=>{
  try {
    await initDB();
    await registerCommands();
    await client.login(TOKEN);
  } catch(e) {
    console.error("STARTUP ERROR:",e);
    process.exit(1);
  }
})();
