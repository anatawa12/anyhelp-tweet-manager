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

1. Creates a new thread with status emoji prefix (🔍 found)
2. Sends the VXT message link as the first message
3. Mentions the user who reacted to invite them to the thread
4. Adds status control buttons for managing the thread lifecycle

### 3. Thread Status Management

Threads created by the bot include status management for bug report tracking:

- **Status emojis:** Each thread name is prefixed with an emoji indicating its current status
  - 🔍 **found** - Initial status for newly created threads
  - ❓ **asked** - Clarification requested from reporter
  - 🔄 **waiting** - Waiting for fix on the other party's tool side
  - 🛠️ **investigating** - Issue is being investigated
  - 📦 **unreleased** - Fix has been implemented but not released
  - ✅ **fixed** - Fix has been released
  - 🔒 **closed** - Thread is closed

- **Status transitions:** Available transitions are shown as buttons at the bottom of each thread
  - Normal flow: found → asked ↔ waiting ↔ investigating → unreleased → fixed → closed
  - Regression handling: unreleased or fixed can transition back to asked/waiting/investigating if fix fails
  - The waiting status can also transition directly to unreleased or fixed

- **Status controls:** Each thread contains interactive buttons that update the thread status and name automatically

### 4. Manual Thread Creation

Create threads manually using the `/create-thread` slash command:

- **Command:** `/create-thread name:<thread-name>`
- **Usage:** Can be used for bug reports submitted through non-tweet channels
- Threads are created with the initial "found" status
- User is automatically invited to the thread
- Status control buttons are added automatically

## Setup

### Prerequisites

- Node.js >= 22.12.0
- A Discord bot token with the following permissions:
  - Read Messages/View Channels
  - Send Messages
  - Create Public Threads
  - Manage Threads (for renaming threads)
  - Add Reactions
  - Use Slash Commands
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
     "retweetReaction": "1467831704046670080",
     "channels": {
       "channel_id_to_monitor": {
         "sender": "webhook_user_id_or_null"
       }
     }
   }
   ```

### Configuration

- **vxtBot**: User ID of the bot that applies fxtwitter (VXT bot)
- **guild**: Your Discord server/guild ID
- **errorChannel**: Channel ID for error reporting (set to `null` to disable)
- **retweetReaction**: Emoji ID or Unicode emoji to react with on original messages when retweet is detected
- **channels**: Object mapping channel IDs to monitor, with their webhook sender IDs
  - **sender**: Webhook user ID to filter messages (set to `null` to handle all messages in the channel)

## Usage

### Development

```bash
# Build the TypeScript code
npm run build

# Run the bot
npm start

# Process RT detection for existing messages
npm run process-rt -- -c <channelId> -n <count>

# Lint code
npm run lint

# Format code
npm run format
```

### Docker

The bot is available as a Docker container on GitHub Container Registry.

#### Running with Docker

**Run the bot (default mode):**
```bash
docker run --rm \
  -e DISCORD_TOKEN=your_bot_token \
  -e APPLICATION_ID=your_application_id \
  -e SETTINGS_JSON='{"vxtBot":"1015497909925580830","guild":"your_guild_id","errorChannel":null,"retweetReaction":"1467831704046670080","channels":{"channel_id":{"sender":"webhook_id"}}}' \
  ghcr.io/anatawa12/anyhelp-tweet-manager:latest
```

**Process existing messages:**
```bash
docker run --rm \
  -e DISCORD_TOKEN=your_bot_token \
  -e APPLICATION_ID=your_application_id \
  -e SETTINGS_JSON='{"vxtBot":"1015497909925580830","guild":"your_guild_id","errorChannel":null,"retweetReaction":"1467831704046670080","channels":{"channel_id":{"sender":"webhook_id"}}}' \
  ghcr.io/anatawa12/anyhelp-tweet-manager:latest \
  -c channel_id -n 50
```

**Environment Variables:**
- `DISCORD_TOKEN`: Your Discord bot token (required)
- `APPLICATION_ID`: Your application ID (required)
- `SETTINGS_JSON`: JSON string containing your settings (optional if you mount a settings.json file)

**Alternative: Mount settings.json file:**
```bash
docker run --rm \
  -e DISCORD_TOKEN=your_bot_token \
  -e APPLICATION_ID=your_application_id \
  -v /path/to/settings.json:/app/settings.json \
  ghcr.io/anatawa12/anyhelp-tweet-manager:latest
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

### Processing Existing Messages

The bot includes a CLI command to retroactively process RT detection for existing messages:

```bash
npm run process-rt -- -c <channelId> -n <count>
```

**Options:**
- `-c, --channel <channelId>`: The Discord channel ID to process (must be in your `settings.json` configuration)
- `-n, --count <number>`: Number of recent messages to process

**Example:**
```bash
# Process the last 50 messages in channel 1235990408207536151
npm run process-rt -- -c 1235990408207536151 -n 50
```

**Notes:**
- The channel must be configured in your `settings.json` file
- Only VXT bot reply messages will be processed
- The bot will apply the same RT detection logic as real-time processing
- Retweets will be marked with reactions automatically

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
