require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!TOKEN || !CLIENT_ID || !GEMINI_KEY) {
  console.error("❌ Missing environment variables!");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_KEY
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const aiChannels = new Map();
const logChannels = new Map();
const warnings = new Map();
const cooldowns = new Map();

async function askAI(prompt) {
  const maxRetries = 4;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🤖 Gemini attempt ${attempt}/${maxRetries}`
      );

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt
      });

      const answer = response.text;

      if (answer && answer.trim()) {
        console.log("✅ Gemini response received");
        return answer.trim();
      }

      return "⚠️ AI returned an empty response.";

    } catch (error) {
      const errorText =
        String(error?.message || error);

      console.error(
        `❌ Gemini error: ${errorText}`
      );

      const temporary =
        errorText.includes("503") ||
        errorText.includes("UNAVAILABLE") ||
        errorText.includes("429") ||
        errorText.includes("RESOURCE_EXHAUSTED") ||
        errorText.includes("high demand");

      if (!temporary || attempt === maxRetries) {
        return "⚠️ Gemini is temporarily unavailable. Please try again.";
      }

      const wait =
        2000 * Math.pow(2, attempt - 1);

      console.log(
        `⏳ Retrying in ${wait / 1000}s...`
      );

      await new Promise(resolve =>
        setTimeout(resolve, wait)
      );
    }
  }

  return "⚠️ AI temporarily unavailable.";
}

async function sendLog(guild, text) {
  const channelId = logChannels.get(guild.id);

  if (!channelId) return;

  const channel =
    guild.channels.cache.get(channelId);

  if (!channel) return;

  try {
    await channel.send(text);
  } catch {}
}

const commands = [

  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Ask Prime AI")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setaichannel")
    .setDescription("Set current channel as AI channel"),

  new SlashCommandBuilder()
    .setName("removeaichannel")
    .setDescription("Remove AI channel"),

  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set current channel as log channel"),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View member warnings")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("1-100")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Timeout minutes")
        .setMinValue(1)
        .setMaxValue(10080)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban user")
    .addStringOption(option =>
      option
        .setName("userid")
        .setDescription("User ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock channel"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock channel"),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .addIntegerOption(option =>
      option
        .setName("seconds")
        .setDescription("0-21600 seconds")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user information")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show avatar")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
    ),

  new SlashCommandBuilder()
    .setName("channelinfo")
    .setDescription("Show channel information"),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Show bot settings"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all commands")

].map(command => command.toJSON());

client.once("ready", async () => {

  console.log("==============================");
  console.log(`✅ Logged in: ${client.user.tag}`);
  console.log(`🧠 Gemini: ${GEMINI_MODEL}`);
  console.log("==============================");

  client.user.setActivity(
    "Prime Development Studio",
    { type: 3 }
  );

  try {
    const rest =
      new REST({ version: "10" })
        .setToken(TOKEN);

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
      "❌ Command registration error:",
      error
    );
  }
});
client.on("interactionCreate",async i=>{
if(!i.isChatInputCommand())return;
try{
const g=i.guild,c=i.commandName;

if(c==="ai"){
await i.deferReply();
return i.editReply((await askAI(i.options.getString("question"))).slice(0,1900));
}

if(c==="setaichannel"){
aiChannels.set(g.id,i.channel.id);
return i.reply(`✅ AI Channel: ${i.channel}`);
}

if(c==="removeaichannel"){
aiChannels.delete(g.id);
return i.reply("✅ AI channel removed.");
}

if(c==="setlogchannel"){
logChannels.set(g.id,i.channel.id);
return i.reply(`✅ Log Channel: ${i.channel}`);
}

if(c==="warn"){
const u=i.options.getUser("user");
const r=i.options.getString("reason");
const k=`${g.id}-${u.id}`;
const w=warnings.get(k)||[];
w.push(r);warnings.set(k,w);
return i.reply(`⚠️ ${u} warned: ${r}`);
}

if(c==="warnings"){
const u=i.options.getUser("user");
const w=warnings.get(`${g.id}-${u.id}`)||[];
return i.reply(w.length?`⚠️ ${u} warnings:\n${w.map((x,n)=>`${n+1}. ${x}`).join("\n")}`:`✅ No warnings.`);
}

if(c==="clear"){
if(!i.memberPermissions.has(PermissionsBitField.Flags.ManageMessages))return i.reply("❌ Permission denied.");
const n=i.options.getInteger("amount");
await i.channel.bulkDelete(n,true);
return i.reply({content:`🧹 Deleted ${n} messages.`,ephemeral:true});
}

if(c==="timeout"){
const u=i.options.getUser("user"),m=i.options.getInteger("minutes");
const x=await g.members.fetch(u.id);
await x.timeout(m*60000);
return i.reply(`🔇 ${u} timed out for ${m} minutes.`);
}

if(c==="untimeout"){
const u=i.options.getUser("user"),x=await g.members.fetch(u.id);
await x.timeout(null);
return i.reply(`🔊 Timeout removed from ${u}.`);
}

if(c==="kick"){
const u=i.options.getUser("user");
await g.members.kick(u.id);
return i.reply(`👢 ${u.tag} kicked.`);
}

if(c==="ban"){
const u=i.options.getUser("user");
await g.members.ban(u.id);
return i.reply(`🔨 ${u.tag} banned.`);
}

if(c==="unban"){
const id=i.options.getString("userid");
await g.members.unban(id);
return i.reply(`✅ ${id} unbanned.`);
}

if(c==="lock"){
await i.channel.permissionOverwrites.edit(g.roles.everyone,{SendMessages:false});
return i.reply("🔒 Channel locked.");
}

if(c==="unlock"){
await i.channel.permissionOverwrites.edit(g.roles.everyone,{SendMessages:null});
return i.reply("🔓 Channel unlocked.");
}

if(c==="slowmode"){
const s=i.options.getInteger("seconds");
await i.channel.setRateLimitPerUser(s);
return i.reply(`🐌 Slowmode: ${s}s`);
}

if(c==="serverinfo")
return i.reply(`📊 **${g.name}**\n👥 Members: ${g.memberCount}\n📁 Channels: ${g.channels.cache.size}`);

if(c==="userinfo"){
const u=i.options.getUser("user")||i.user;
return i.reply(`👤 **${u.tag}**\n🆔 ${u.id}\n🤖 Bot: ${u.bot}`);
}

if(c==="avatar"){
const u=i.options.getUser("user")||i.user;
return i.reply(u.displayAvatarURL({size:1024}));
}

if(c==="channelinfo")
return i.reply(`📁 **${i.channel.name}**\n🆔 ${i.channel.id}`);

if(c==="settings")
return i.reply(`⚙️ AI: ${aiChannels.get(g.id)?`<#${aiChannels.get(g.id)}>`:"Not Set"}\n📋 Logs: ${logChannels.get(g.id)?`<#${logChannels.get(g.id)}>`:"Not Set"}\n🧠 ${GEMINI_MODEL}`);

if(c==="help")
return i.reply("🤖 **Prime AI**\n`/ai` `/setaichannel` `/removeaichannel`\n`/warn` `/warnings` `/clear` `/timeout` `/untimeout`\n`/kick` `/ban` `/unban`\n`/lock` `/unlock` `/slowmode`\n`/serverinfo` `/userinfo` `/avatar` `/channelinfo`\n`/setlogchannel` `/settings` `/help`");

}catch(e){
console.error(e);
if(!i.replied&&!i.deferred) i.reply("❌ Error.");
}
});

client.on("messageCreate",async m=>{
if(m.author.bot||!m.guild)return;
if(aiChannels.get(m.guild.id)!==m.channel.id)return;

const k=`${m.guild.id}-${m.author.id}`,now=Date.now();
if(now-(cooldowns.get(k)||0)<5000)return;
cooldowns.set(k,now);

await m.channel.sendTyping();

const a=await askAI(m.content);
for(let x=0;x<a.length;x+=1900)
await m.channel.send(a.slice(x,x+1900));
});

const app=express();

app.get("/",(q,s)=>s.send("🚀 Prime AI Online"));

app.get("/health",(q,s)=>s.json({
status:"online",
gemini:GEMINI_MODEL,
uptime:process.uptime()
}));

app.listen(process.env.PORT||3000,()=>console.log("🌐 Web server online"));

client.login(TOKEN);
