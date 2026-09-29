# Prime Development Studio AI V7

MongoDB/Turso-free Discord AI bot.

## Render
Build Command: `npm install`
Start Command: `node index.js`

## Environment Variables
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GEMINI_API_KEY`
- Optional: `GEMINI_MODEL` (defaults to `gemini-3.8-flash`)

## Important
Data is saved to `data.json`. Render Free's filesystem is ephemeral, so this local file is NOT guaranteed to survive a restart/redeploy. This version intentionally uses no MongoDB or Turso.

Never upload `.env` or secret keys to GitHub.
