const { 
    Client, 
    GatewayIntentBits, 
    PermissionsBitField, 
    AuditLogEvent, 
    EmbedBuilder 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildAuditLogs
    ]
});

// CONFIGURATION SETTINGS
const PREFIX = '!';
const RAID_JOIN_LIMIT = 5;      // 5 joins in 10 seconds = Raid Trigger
const RAID_TIME_LIMIT = 10000; 
const NUKE_ACTION_LIMIT = 3;    // 3 deletes/kicks in 10 seconds = Nuke Trigger
const NUKE_TIME_LIMIT = 10000;  

// Tracking Caches
const joinLog = [];
const actionCache = new Map();

client.once('ready', () => {
    console.log(`🚀 ${client.user.tag} active hai aur server ko protect kar raha hai!`);
});

// ==========================================
// 1. WELCOME SYSTEM
// ==========================================
client.on('guildMemberAdd', async (member) => {
    // Apne server ke Welcome channel ka Name ya ID yahan set karein
    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === 'welcome' || ch.name === 'general');
    
    if (welcomeChannel) {
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#00FF7F')
            .setTitle(`Welcome to ${member.guild.name}! 👋`)
            .setDescription(`Hey ${member}, welcome to the server! Make sure to check the rules.`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `Member #${member.guild.memberCount}` })
            .setTimestamp();

        welcomeChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
    }
});

// ==========================================
// 2. ANTI-RAID SYSTEM
// ==========================================
client.on('guildMemberAdd', async (member) => {
    const now = Date.now();
    joinLog.push(now);

    while (joinLog.length > 0 && joinLog[0] < now - RAID_TIME_LIMIT) {
        joinLog.shift();
    }

    if (joinLog.length >= RAID_JOIN_LIMIT) {
        try {
            if (member.kickable) {
                await member.kick('Anti-Raid Protection Triggered');
                console.log(`🚨 Raid Member Kicked: ${member.user.tag}`);
            }
        } catch (err) {
            console.error('Anti-Raid error:', err);
        }
    }
});

// ==========================================
// 3. AUTO-MOD & LINK PROTECTION
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Link Detection Regex
    const linkRegex = /(https?:\/\/[^\s]+)/g;

    if (linkRegex.test(message.content)) {
        if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        try {
            await message.delete();
            const warnMsg = await message.channel.send(`⚠️ ${message.author}, links are not allowed here!`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        } catch (err) {
            console.error('Link Delete error:', err);
        }
    }

    // Mass Mentions Protection (>5 mentions)
    if (message.mentions.users.size > 5) {
        if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        try {
            await message.delete();
            const warnMsg = await message.channel.send(`⚠️ ${message.author}, mass mentions are not allowed!`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        } catch (err) {
            console.error('Mass mention error:', err);
        }
    }
});

// ==========================================
// 4. ANTI-NUKE SYSTEM (Channels, Roles & Bans)
// ==========================================
async function handleAntiNuke(guild, executorId, actionType) {
    if (executorId === client.user.id || executorId === guild.ownerId) return;

    const now = Date.now();
    const userActions = actionCache.get(executorId) || [];
    const recentActions = userActions.filter(time => now - time < NUKE_TIME_LIMIT);
    
    recentActions.push(now);
    actionCache.set(executorId, recentActions);

    if (recentActions.length >= NUKE_ACTION_LIMIT) {
        try {
            const member = await guild.members.fetch(executorId).catch(() => null);
            if (member && member.bannable) {
                await member.ban({ reason: `Anti-Nuke Triggered: Excessive ${actionType}` });
                console.log(`🚨 ANTI-NUKE: Banned ${member.user.tag} for ${actionType}!`);
            }
        } catch (err) {
            console.error('Anti-Nuke execute error:', err);
        }
    }
}

// Anti-Nuke: Channel Delete
client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    const entry = logs?.entries.first();
    if (entry) handleAntiNuke(channel.guild, entry.executor.id, 'Channel Deletion');
});

// Anti-Nuke: Role Delete
client.on('roleDelete', async (role) => {
    if (!role.guild) return;
    const logs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete }).catch(() => null);
    const entry = logs?.entries.first();
    if (entry) handleAntiNuke(role.guild, entry.executor.id, 'Role Deletion');
});

// Anti-Nuke: Member Ban
client.on('guildBanAdd', async (ban) => {
    const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd }).catch(() => null);
    const entry = logs?.entries.first();
    if (entry) handleAntiNuke(ban.guild, entry.executor.id, 'Mass Ban');
});

// ==========================================
// 5. MODERATION COMMANDS (!kick, !ban, !clear)
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Clear / Purge Messages Command
    if (command === 'clear' || command === 'purge') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply("❌ Aapke paas `Manage Messages` ki permission nahi hai.");
        }
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply("❌ Kripya 1 se 100 ke beech koi number dein. Example: `!clear 20`");
        }

        await message.channel.bulkDelete(amount, true).catch(err => console.error(err));
        const reply = await message.channel.send(`✅ Successfully deleted ${amount} messages.`);
        setTimeout(() => reply.delete().catch(() => {}), 3000);
    }

    // Kick Command
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply("❌ Aapke paas members kick karne ki permission nahi hai.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ User ko mention karein: `!kick @user [reason]`");
        if (!member.kickable) return message.reply("❌ Is member ko kick nahi kiya ja sakta.");

        const reason = args.slice(1).join(' ') || 'No reason provided';
        await member.kick(reason);
        message.channel.send(`✅ **${member.user.tag}** ko kick kar diya gaya hai. Reason: ${reason}`);
    }

    // Ban Command
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply("❌ Aapke paas members ban karne ki permission nahi hai.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ User ko mention karein: `!ban @user [reason]`");
        if (!member.bannable) return message.reply("❌ Is member ko ban nahi kiya ja sakta.");

        const reason = args.slice(1).join(' ') || 'No reason provided';
        await member.ban({ reason });
        message.channel.send(`⛔ **${member.user.tag}** ko ban kar diya gaya hai. Reason: ${reason}`);
    }
});

// Paste your Bot Token below
client.login('YOUR_BOT_TOKEN_HERE');
