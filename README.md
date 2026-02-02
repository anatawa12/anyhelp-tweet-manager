# AnyHelp Tweet Manager Bot

A Discord bot that manages tweets posted via IFTTT webhooks, with automatic retweet detection and thread creation features.

## Features

### 1. Retweet Detection

The bot automatically detects if a tweet posted by IFTTT is a retweet by analyzing the VXT (fxtwitter) reply:

- Compares the tweet ID from the OGP embed author URL with the root URL
- If they differ, the tweet is a retweet
- **Actions on retweet detection:**
  - Reacts with emoji `1467831704046670080` on the original IFTTT message
  - Reacts with ❌ on the VXT reply to trigger deletion
- **Error handling:** If tweet IDs cannot be extracted, an error is reported to the configured error channel

### 2. Thread Creation

When users react to VXT messages with 👀 emoji:

1. Creates a new thread named after the tweet author (from embed)
2. Sends the VXT message link as the first message
3. Mentions the user who reacted to invite them to the thread

## Setup

### Prerequisites

- Node.js >= 22.12.0
- A Discord bot token with the following permissions:
  - Read Messages/View Channels
  - Send Messages
  - Create Public Threads
  - Add Reactions
  - Message Content Intent (required)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd anyhelp-tweet-manager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```
   
   Add your Discord bot token:
   ```
   DISCORD_TOKEN=your_bot_token_here
   APPLICATION_ID=your_application_id
   ```

4. Create a `settings.json` file:
   ```bash
   cp settings.example.json settings.json
   ```
   
   Configure your channels and settings:
   ```json
   {
     "vxtBot": "1015497909925580830",
     "guild": "your_guild_id",
     "errorChannel": "error_channel_id_or_null",
     "channels": {
       "channel_id_to_monitor": {
         "sender": "webhook_user_id"
       }
     }
   }
   ```

### Configuration

- **vxtBot**: User ID of the bot that applies fxtwitter (VXT bot)
- **guild**: Your Discord server/guild ID
- **errorChannel**: Channel ID for error reporting (set to `null` to disable)
- **channels**: Object mapping channel IDs to monitor, with their webhook sender IDs

## Usage

### Development

```bash
# Build the TypeScript code
npm run build

# Run the bot
npm start

# Lint code
npm run lint

# Format code
npm run format
```

### Production

1. Build the project:
   ```bash
   npm run build
   ```

2. Run the bot:
   ```bash
   npm start
   ```

## How It Works

### Message Flow

1. IFTTT webhook posts a tweet URL to a monitored channel
   - Format: `<https://twitter.com/username/status/123456789>`
   - Optional: `<url> by username`

2. VXT bot replies with fxtwitter URL
   - VXT converts Twitter URL to fxtwitter URL
   - Discord fetches OGP embed (takes 5-15 seconds)

3. This bot analyzes the embed
   - Waits for embed to load (5 sec + 10 sec retry if needed)
   - Extracts tweet IDs from URLs
   - Compares to detect retweets
   - Reacts accordingly

### Thread Creation Flow

1. User reacts to VXT message with 👀
2. Bot creates thread with tweet author's name
3. Bot posts VXT message link in thread
4. Bot mentions the reactor to invite them

## Architecture

- **src/index.ts**: Main bot logic and event handlers
- **src/config.ts**: Configuration loading and validation (using Zod)
- **src/utils.ts**: Utility functions for tweet URL parsing and retweet detection

## Security

- No security vulnerabilities detected by CodeQL
- Configuration files (`.env`, `settings.json`) are gitignored
- Proper error handling prevents information leakage

## License

See LICENSE file for details.
