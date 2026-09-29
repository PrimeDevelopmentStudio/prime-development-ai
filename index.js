require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType
} = require("discord.js");
const { GoogleGenAI } = require("@google/genai");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !GEMINI_API_KEY) {
  console.error("❌ Missing DISCORD_TOKEN, CLIENT_ID or GEMINI_API_KEY");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const DATA_FILE = path.join(__dirname, "data.json");
const DEFAULT = { guilds: {}, users: {}, warnings: {}, giveaways: {} };

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(DEFAULT);
    const x = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { ...structuredClone(DEFAULT), ...x };
  } catch (e) {
    console.error("DATA LOAD ERROR:", e);
    return structuredClone(DEFAULT);
  }
}
let db = loadData();
let saveTimer;
function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) { console.error("DATA SAVE ERROR:", e); }
  }, 200);
}
function gd(id) {
  db.guilds[id] ??= {
    aiChannelId: null, welcomeChannelId: null, welcomeMessage: "Welcome {user} to {server}! 🎉",
    antiLink: false, logChannelId: null, autoroleId: null
  };
  return db.guilds[id];
}
function ud(guildId, userId) {
  const key = `${guildId}:${userId}`;
  db.users[key] ??= { cash: 0, xp: 0, level: 1, lastDaily: 0, lastWork: 0, lastCrime: 0 };
  return db.users[key];
}
function warns(guildId, userId) {
  const key = `${guildId}:${userId}`;
  db.warnings[key] ??= [];
  return db.warnings[key];
}

async function askAI(question) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await ai.models.generateContent({ model: MODEL, contents: question });
      return r.text || "No response.";
    } catch (e) {
      last = e;
      const s = Number(e?.status || e?.error?.code);
      if (![429, 500, 502, 503, 504].includes(s) &&
          !String(e).includes("503") && !String(e).includes("429")) break;
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  console.error("GEMINI ERROR:", last);
  return "❌ Gemini is temporarily busy. Please try again in a moment.";
}

async function aiAction(text, member) {
  const prompt = `You are Prime Development Studio AI.
Return ONLY valid JSON: {"action":"...","data":{...}}
Allowed actions:
answer {text}
addcash {userId,amount}
removecash {userId,amount}
setcash {userId,amount}
addxp {userId,amount}
setlevel {userId,level}
antilink_on {}
antilink_off {}
For normal questions use answer.
Never invent user IDs. If a target user ID is not explicitly available, use answer.
Request: ${text}
Requester ID: ${member.id}`;
  const raw = await askAI(prompt);
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { action: "answer", data: { text: raw } };
  }
}

async function sendLog(guild, text) {
  const id = gd(guild.id).logChannelId;
  if (!id) return;
  const ch = guild.channels.cache.get(id);
  if (ch) await ch.send(`📋 ${text}`).catch(() => {});
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent
  ]
});

const commands = [
  ["ai","Ask Prime AI",[["question","Question",true]]],
  ["setaichannel","Set AI channel",[["channel","Channel",true]]],
  ["removeaichannel","Remove AI channel",[]],
  ["serverinfo","Server information",[]],
  ["userinfo","User information",[["user","User",false]]],
  ["avatar","Show avatar",[["user","User",false]]],
  ["announce","Send announcement",[["message","Message",true]]],
  ["welcome","Set welcome channel",[["channel","Channel",true]]],
  ["removewelcome","Remove welcome",[]],
  ["autorole","Set autorole",[["role","Role",true]]],
  ["antilink","Anti-link",[["mode","on/off",true]]],
  ["setlogs","Set log channel",[["channel","Channel",true]]],
  ["clear","Delete messages",[["amount","1-100",true]]],
  ["kick","Kick member",[["user","Member",true],["reason","Reason",false]]],
  ["ban","Ban member",[["user","Member",true],["reason","Reason",false]]],
  ["timeout","Timeout member",[["user","Member",true],["minutes","Minutes",true]]],
  ["warn","Warn member",[["user","Member",true],["reason","Reason",false]]],
  ["warnings","Show warnings",[["user","Member",true]]],
  ["lock","Lock current channel",[]],
  ["unlock","Unlock current channel",[]],
  ["balance","Show balance",[["user","User",false]]],
  ["daily","Claim daily cash",[]],
  ["work","Work for cash",[]],
  ["crime","Try a risky crime",[]],
  ["pay","Pay user",[["user","User",true],["amount","Amount",true]]],
  ["addcash","Admin: add cash",[["user","User",true],["amount","Amount",true]]],
  ["removecash","Admin: remove cash",[["user","User",true],["amount","Amount",true]]],
  ["rank","Show XP rank",[["user","User",false]]],
  ["leaderboard","XP leaderboard",[]],
  ["ticket","Create support ticket",[]],
  ["giveaway","Start giveaway",[["minutes","Minutes",true],["prize","Prize",true]]],
  ["help","Show commands",[]]
];

function buildCommand([name, desc, opts]) {
  const c = new SlashCommandBuilder().setName(name).setDescription(desc);
  for (const [n,d,required] of opts) {
    if (n === "channel") c.addChannelOption(o => o.setName(n).setDescription(d).setRequired(required).addChannelTypes(ChannelType.GuildText));
    else if (n === "role") c.addRoleOption(o => o.setName(n).setDescription(d).setRequired(required));
    else if (n === "user") c.addUserOption(o => o.setName(n).setDescription(d).setRequired(required));
    else if (n === "amount" || n === "minutes") c.addIntegerOption(o => o.setName(n).setDescription(d).setRequired(required).setMinValue(1).setMaxValue(n==="amount"?100000000:10080));
    else c.addStringOption(o => o.setName(n).setDescription(d).setRequired(required));
  }
  if (["addcash","removecash"].includes(name)) c.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  return c.toJSON();
}
const commandData = commands.map(buildCommand);

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commandData });
}

function isAdmin(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.Administrator);
}
async function requireAdmin(i) {
  if (!isAdmin(i)) {
    await i.reply({ content: "❌ Administrator permission required.", ephemeral: true });
    return false;
  }
  return true;
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try { await registerCommands(); console.log("✅ Slash commands registered"); }
  catch (e) { console.error("COMMAND REGISTER ERROR:", e); }
});

client.on("interactionCreate", async i => {
  try {
    if (i.isButton()) {
      if (i.customId === "close_ticket") {
        await i.reply("🔒 Closing ticket...");
        setTimeout(() => i.channel.delete().catch(() => {}), 1000);
      }
      return;
    }
    if (!i.isChatInputCommand() || !i.guild) return;

    const g = i.guild, c = i.commandName;
    const adminCommands = ["setaichannel","removeaichannel","welcome","removewelcome","autorole","antilink","setlogs","clear","kick","ban","timeout","warn","lock","unlock","announce"];
    if (adminCommands.includes(c) && !(await requireAdmin(i))) return;

    if (c === "ai") return i.reply({ content: await askAI(i.options.getString("question")), allowedMentions:{parse:[]} });
    if (c === "setaichannel") { gd(g.id).aiChannelId=i.options.getChannel("channel").id; saveData(); return i.reply("✅ AI channel set."); }
    if (c === "removeaichannel") { gd(g.id).aiChannelId=null; saveData(); return i.reply("✅ AI channel removed."); }
    if (c === "welcome") { gd(g.id).welcomeChannelId=i.options.getChannel("channel").id; saveData(); return i.reply("✅ Welcome channel set."); }
    if (c === "removewelcome") { gd(g.id).welcomeChannelId=null; saveData(); return i.reply("✅ Welcome removed."); }
    if (c === "autorole") { gd(g.id).autoroleId=i.options.getRole("role").id; saveData(); return i.reply("✅ Autorole set."); }
    if (c === "antilink") {
      const mode=i.options.getString("mode").toLowerCase();
      if (!["on","off"].includes(mode)) return i.reply("Use `on` or `off`.");
      gd(g.id).antiLink=mode==="on"; saveData(); return i.reply(`✅ Anti-link ${mode==="on"?"enabled":"disabled"}.`);
    }
    if (c === "setlogs") { gd(g.id).logChannelId=i.options.getChannel("channel").id; saveData(); return i.reply("✅ Log channel set."); }
    if (c === "clear") {
      const n=i.options.getInteger("amount"); await i.channel.bulkDelete(n,true);
      return i.reply({content:`🧹 Deleted ${n} messages.`,ephemeral:true});
    }
    if (c === "kick" || c === "ban" || c === "timeout") {
      const m=await g.members.fetch(i.options.getUser("user").id);
      if (c==="kick") await m.kick(i.options.getString("reason")||"No reason");
      if (c==="ban") await m.ban({reason:i.options.getString("reason")||"No reason"});
      if (c==="timeout") await m.timeout(i.options.getInteger("minutes")*60000);
      await sendLog(g,`${m.user.tag} ${c}ed by ${i.user.tag}`);
      return i.reply(`✅ ${c==="timeout"?"Timed out":" "+c+"ed"} ${m.user.tag}.`);
    }
    if (c === "warn") {
      const u=i.options.getUser("user"), reason=i.options.getString("reason")||"No reason";
      warns(g.id,u.id).push({reason,by:i.user.id,at:Date.now()}); saveData();
      await sendLog(g,`${u.tag} warned by ${i.user.tag}: ${reason}`);
      return i.reply(`⚠️ Warned ${u.tag}.`);
    }
    if (c === "warnings") {
      const u=i.options.getUser("user"), w=warns(g.id,u.id);
      return i.reply(w.length ? `⚠️ **${u.tag}** has ${w.length} warning(s).\n${w.map((x,n)=>`${n+1}. ${x.reason}`).join("\n")}` : `✅ ${u.tag} has no warnings.`);
    }
    if (c==="lock" || c==="unlock") {
      await i.channel.permissionOverwrites.edit(g.roles.everyone,{SendMessages:c==="unlock"});
      return i.reply(c==="lock"?"🔒 Channel locked.":"🔓 Channel unlocked.");
    }
    if (c==="serverinfo") return i.reply(`🏠 **${g.name}**\n👥 Members: ${g.memberCount}\n🆔 ${g.id}`);
    if (c==="userinfo") { const u=i.options.getUser("user")||i.user; return i.reply(`👤 **${u.tag}**\n🆔 ${u.id}\n📅 Created <t:${Math.floor(u.createdTimestamp/1000)}:F>`); }
    if (c==="avatar") { const u=i.options.getUser("user")||i.user; return i.reply(u.displayAvatarURL({size:1024})); }
    if (c==="announce") {
      const e=new EmbedBuilder().setTitle("📢 Announcement").setDescription(i.options.getString("message")).setTimestamp();
      await i.channel.send({embeds:[e]}); return i.reply({content:"✅ Announcement sent.",ephemeral:true});
    }

    if (c==="balance") { const u=i.options.getUser("user")||i.user; return i.reply(`💰 **${u.username}**: ${ud(g.id,u.id).cash} cash`); }
    if (["daily","work","crime"].includes(c)) {
      const d=ud(g.id,i.user.id), now=Date.now();
      const key=c==="daily"?"lastDaily":c==="work"?"lastWork":"lastCrime";
      const cd=c==="daily"?86400000:3600000;
      if(now-d[key]<cd) return i.reply({content:`⏳ Try again <t:${Math.floor((d[key]+cd)/1000)}:R>.`,ephemeral:true});
      let amount=c==="daily"?1000:Math.floor(Math.random()*501)+250;
      if(c==="crime" && Math.random()<0.35) amount=-Math.floor(Math.random()*301)-100;
      d.cash=Math.max(0,d.cash+amount); d[key]=now; saveData();
      return i.reply(amount>=0?`💵 You earned **${amount}** cash.`:`🚨 Crime failed. You lost **${Math.abs(amount)}** cash.`);
    }
    if (c==="pay") {
      const u=i.options.getUser("user"), a=i.options.getInteger("amount"), me=ud(g.id,i.user.id);
      if(me.cash<a) return i.reply({content:"❌ Not enough cash.",ephemeral:true});
      me.cash-=a; ud(g.id,u.id).cash+=a; saveData(); return i.reply(`💸 Paid **${a}** cash to ${u}.`);
    }
    if (c==="addcash" || c==="removecash") {
      if(!(await requireAdmin(i))) return;
      const u=i.options.getUser("user"), a=i.options.getInteger("amount"), d=ud(g.id,u.id);
      d.cash=Math.max(0,d.cash+(c==="addcash"?a:-a)); saveData(); return i.reply(`✅ ${u} now has **${d.cash}** cash.`);
    }
    if(c==="rank"){const u=i.options.getUser("user")||i.user,d=ud(g.id,u.id);return i.reply(`📈 **${u.username}** — Level ${d.level}, XP ${d.xp}`);}
    if(c==="leaderboard"){
      const rows=Object.entries(db.users).filter(([k])=>k.startsWith(g.id+":")).sort((a,b)=>b[1].xp-a[1].xp).slice(0,10);
      return i.reply(rows.length?`🏆 **XP Leaderboard**\n${rows.map(([k,d],n)=>`${n+1}. <@${k.split(":")[1]}> — Lv.${d.level} (${d.xp} XP)`).join("\n")}`:"No XP data yet.");
    }
    if(c==="ticket"){
      const safe=i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,70)||"user";
      const ch=await g.channels.create({name:`ticket-${safe}`,type:ChannelType.GuildText,permissionOverwrites:[
        {id:g.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
        {id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
      ]});
      await ch.send({content:`🎫 ${i.user} support ticket.`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_ticket").setLabel("Close Ticket").setStyle(ButtonStyle.Danger))]});
      return i.reply({content:`✅ Ticket created: ${ch}`,ephemeral:true});
    }
    if(c==="giveaway"){
      if(!(await requireAdmin(i))) return;
      const minutes=i.options.getInteger("minutes"), prize=i.options.getString("prize"), end=Date.now()+minutes*60000;
      const msg=await i.channel.send({embeds:[new EmbedBuilder().setTitle("🎉 Giveaway").setDescription(`Prize: **${prize}**\nReact with 🎉 to enter!\nEnds <t:${Math.floor(end/1000)}:R>`).setTimestamp(end)]});
      await msg.react("🎉");
      db.giveaways[msg.id]={guildId:g.id,channelId:i.channel.id,prize,end}; saveData();
      setTimeout(()=>finishGiveaway(msg.id),minutes*60000);
      return i.reply({content:"✅ Giveaway started.",ephemeral:true});
    }
    if(c==="help") return i.reply("🤖 **Prime Development Studio AI**\n\nAI: `/ai` `/setaichannel`\nModeration: `/ban` `/kick` `/timeout` `/warn` `/warnings` `/clear` `/lock` `/unlock` `/antilink`\nEconomy: `/balance` `/daily` `/work` `/crime` `/pay` `/addcash` `/removecash`\nXP: `/rank` `/leaderboard`\nCommunity: `/ticket` `/giveaway` `/welcome` `/autorole` `/setlogs`\nInfo: `/serverinfo` `/userinfo` `/avatar` `/announce`");
  } catch(e) {
    console.error("COMMAND ERROR:",e);
    if(!i.replied && !i.deferred) await i.reply({content:"❌ Something went wrong. Check Render Logs.",ephemeral:true}).catch(()=>{});
  }
});

async function finishGiveaway(id){
  const g=db.giveaways[id]; if(!g) return;
  try{
    const ch=await client.channels.fetch(g.channelId), msg=await ch.messages.fetch(id);
    const reaction=msg.reactions.cache.get("🎉");
    const users=reaction?await reaction.users.fetch():new Map();
    const entries=[...users.values()].filter(u=>!u.bot);
    if(!entries.length) await ch.send("🎉 Giveaway ended, but nobody entered.");
    else await ch.send(`🎉 Congratulations ${entries[Math.floor(Math.random()*entries.length)]}! You won **${g.prize}**!`);
  }catch(e){console.error("GIVEAWAY ERROR:",e);}
  delete db.giveaways[id]; saveData();
}

client.on("messageCreate", async msg=>{
  if(msg.author.bot || !msg.guild) return;
  const g=gd(msg.guild.id);

  if(g.antiLink && /(https?:\/\/|www\.)\S+/i.test(msg.content) && !msg.member.permissions.has(PermissionFlagsBits.ManageMessages)){
    await msg.delete().catch(()=>{});
    const m=await msg.channel.send(`🔗 ${msg.author}, links are not allowed here.`).catch(()=>null);
    if(m) setTimeout(()=>m.delete().catch(()=>{}),5000);
    await sendLog(msg.guild,`${msg.author.tag} sent a blocked link.`);
    return;
  }

  const d=ud(msg.guild.id,msg.author.id);
  d.xp+=5;
  if(d.xp>=d.level*100){
    d.xp-=d.level*100; d.level++;
    msg.channel.send(`🎉 ${msg.author}, you reached **Level ${d.level}**!`).catch(()=>{});
  }
  saveData();

  if(g.aiChannelId===msg.channel.id){
    const result=await aiAction(msg.content,msg.member);
    const adminOnly=["addcash","removecash","setcash","addxp","setlevel","antilink_on","antilink_off"];
    if(result.action==="answer") return msg.reply({content:result.data?.text||"No response.",allowedMentions:{parse:[]}});
    if(adminOnly.includes(result.action) && !msg.member.permissions.has(PermissionFlagsBits.Administrator))
      return msg.reply("❌ Administrator permission required.");
    const id=result.data?.userId;
    if(["addcash","removecash","setcash","addxp","setlevel"].includes(result.action) && !id)
      return msg.reply("❌ I need a clear target user ID/mention.");
    if(result.action==="addcash") ud(msg.guild.id,id).cash+=Math.max(0,Number(result.data.amount)||0);
    else if(result.action==="removecash") ud(msg.guild.id,id).cash=Math.max(0,ud(msg.guild.id,id).cash-Math.max(0,Number(result.data.amount)||0));
    else if(result.action==="setcash") ud(msg.guild.id,id).cash=Math.max(0,Number(result.data.amount)||0);
    else if(result.action==="addxp") ud(msg.guild.id,id).xp+=Math.max(0,Number(result.data.amount)||0);
    else if(result.action==="setlevel") ud(msg.guild.id,id).level=Math.max(1,Number(result.data.level)||1);
    else if(result.action==="antilink_on") g.antiLink=true;
    else if(result.action==="antilink_off") g.antiLink=false;
    else return msg.reply("❌ I couldn't safely execute that request.");
    saveData(); return msg.reply("✅ Done.");
  }
});

client.on("guildMemberAdd",async member=>{
  const g=gd(member.guild.id);
  if(g.autoroleId) await member.roles.add(g.autoroleId).catch(()=>{});
  if(g.welcomeChannelId){
    const ch=member.guild.channels.cache.get(g.welcomeChannelId);
    if(ch) ch.send(g.welcomeMessage.replaceAll("{user}",`${member}`).replaceAll("{server}",member.guild.name)).catch(()=>{});
  }
});

const app=express();
app.get("/",(_,res)=>res.send("Prime Development Studio AI V7 is online."));
app.get("/health",(_,res)=>res.json({ok:true,model:MODEL}));
app.listen(PORT,()=>console.log(`🌐 Web server on ${PORT}`));

client.login(TOKEN).catch(e=>{console.error("DISCORD LOGIN ERROR:",e);process.exit(1);});
