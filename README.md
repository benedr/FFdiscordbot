FF SensBot (Discord)

Features
- Auto-welcome new members with instructions
- `!sens [series|model]` – sensitivity lookup with fuzzy matching
- `!help` – list commands
- `!register [model]` and `!mysens` – simple per-user device saving

Setup
1) Install Node.js 18+.
2) Create a Discord application and bot, add it to your server with the bot scope and appropriate intents (Server Members, Message Content).
3) Clone or open this folder, then run:
   npm install
4) Create a .env file based on the example below.
5) Start the bot:
   npm start

.env example
DISCORD_TOKEN=your-bot-token-here
# Optional: channel ID to post welcomes
WELCOME_CHANNEL_ID=

Usage
- The bot will greet new members in the configured channel or try #welcome/#general.
- Examples:
  !sens ss           # Samsung S series list
  !sens sm10         # Samsung M10
  !sens iPhone 12    # exact model
  !register Samsung M10
  !mysens

Notes
- Sensitivity values are displayed as:
  General (horizontal), Red Dot (vertical), 2x/4x/AWM Scope (scope), Free Look (freeLook), plus tips.
- Registrations are stored in data/users.json.


