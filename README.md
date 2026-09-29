# Prime Development Studio AI V6

MongoDB-free Discord bot with Gemini AI, persistent Turso/libSQL storage, moderation, economy, levels, tickets, giveaways, welcome/autorole, anti-link, automod and music.

## Render environment variables
DISCORD_TOKEN=your Discord bot token
CLIENT_ID=your Discord application/client ID
GEMINI_API_KEY=your Gemini API key
TURSO_DATABASE_URL=your Turso/libSQL database URL
TURSO_AUTH_TOKEN=your Turso auth token

## Render
Build Command: npm install
Start Command: node index.js
Node: 20+

## Discord intents
Enable Message Content Intent and Server Members Intent in Developer Portal.

## Bot permissions
View Channels, Send Messages, Read Message History, Embed Links, Manage Messages, Manage Channels, Kick Members, Ban Members, Moderate Members, Manage Roles, Connect, Speak.

## Important
Turso/libSQL is required in V6 so economy/settings/warnings/etc. survive Render restarts and redeploys. The live Discord voice connection/music session cannot survive a process restart; users can start music again after restart.
