import process from "node:process";
import { Command } from "commander";
import { Client, GatewayIntentBits, type Message, Partials } from "discord.js";
import { loadConfig } from "./config.js";
import { detectRetweet, extractTweetUrl, waitForEmbed } from "./utils.js";

const program = new Command();

program
	.name("process-rt")
	.description("Process RT detection for existing messages on a channel")
	.requiredOption("-c, --channel <channelId>", "Channel ID to process")
	.requiredOption("-n, --count <number>", "Number of messages to process", parseInt)
	.parse(process.argv);

const options = program.opts<{ channel: string; count: number }>();

// Validate count
if (options.count <= 0 || !Number.isInteger(options.count)) {
	console.error("Error: count must be a positive integer");
	process.exit(1);
}

// Load configuration
const config = await loadConfig();

// Check if channel is in config
const channelConfig = config.channels[options.channel];
if (!channelConfig) {
	console.error(`Error: Channel ${options.channel} is not in the configuration`);
	process.exit(1);
}

// Initialize the client
const client = new Client({
	intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
	partials: [Partials.Message],
});

/**
 * Sends error message to configured error channel
 */
async function reportError(message: string, link?: string): Promise<void> {
	if (!config.errorChannel) return;

	try {
		const errorChannel = await client.channels.fetch(config.errorChannel);
		if (!errorChannel || !errorChannel.isTextBased() || errorChannel.isDMBased()) return;

		const errorMsg = link ? `${message}\n${link}` : message;
		await errorChannel.send(errorMsg);
	} catch (error) {
		console.error("Failed to send error report:", error);
	}
}

/**
 * Process a single VXT message for RT detection
 */
async function processVxtMessage(message: Message): Promise<void> {
	// Check if this is a reply
	if (!message.reference || !message.reference.messageId) return;

	try {
		// Get the original message
		const originalMessage = await message.channel.messages.fetch(message.reference.messageId);

		// Check if original message is from the configured sender
		if (channelConfig.sender !== null && originalMessage.author.id !== channelConfig.sender) return;

		// Extract tweet URL from original message
		const tweetUrl = extractTweetUrl(originalMessage.content);
		if (!tweetUrl) {
			console.log(`No tweet URL found in original message: ${originalMessage.url}`);
			return;
		}

		// Wait for embed to be available on VXT reply
		const messageWithEmbed = await waitForEmbed(message);

		if (!messageWithEmbed || messageWithEmbed.embeds.length === 0) {
			console.log(`No embed found after waiting: ${message.url}`);
			return;
		}

		// Get the first embed
		const embed = messageWithEmbed.embeds[0];

		// Detect if it's a retweet
		const retweetStatus = detectRetweet(tweetUrl, embed);

		if (retweetStatus === "retweet") {
			console.log(`Retweet detected: ${message.url}`);
			// React with configured emoji on original tweet
			await originalMessage.react(config.retweetReaction);
			// React with ❌ on VXT reply
			await messageWithEmbed.react("❌");
		} else if (retweetStatus === "unknown") {
			console.log(`Unknown tweet type, reporting for manual check: ${message.url}`);
			// Report error for manual check
			const vxtMessageLink = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
			await reportError("Cannot determine if tweet is retweet or not. Manual check required.", vxtMessageLink);
		} else {
			console.log(`Original tweet detected, no action taken: ${message.url}`);
			// If it's original, do nothing
		}
	} catch (error) {
		console.error("Error processing message:", error);
		await reportError(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Main function to process RT detection
 */
async function main() {
	console.log("Connecting to Discord...");

	await client.login(process.env.DISCORD_TOKEN);

	console.log(`Logged in as ${client.user?.tag}`);
	console.log(`Processing last ${options.count} messages in channel ${options.channel}...`);

	try {
		// Fetch the channel
		const channel = await client.channels.fetch(options.channel);

		if (!channel || !channel.isTextBased() || channel.isDMBased()) {
			console.error("Error: Channel not found or is not a text channel");
			process.exit(1);
		}

		// Fetch messages
		console.log(`Fetching ${options.count} messages...`);
		const messages = await channel.messages.fetch({ limit: options.count });

		console.log(`Fetched ${messages.size} messages`);

		// Filter messages from VXT bot that are replies
		const vxtMessages = messages.filter((msg) => msg.author.id === config.vxtBot && msg.reference);

		console.log(`Found ${vxtMessages.size} VXT reply messages to process`);

		// Process each message sequentially to avoid Discord API rate limits
		let processed = 0;
		for (const [, message] of vxtMessages) {
			console.log(`Processing message ${++processed}/${vxtMessages.size}...`);
			await processVxtMessage(message);
		}

		console.log("Processing complete!");
	} catch (error) {
		console.error("Error:", error);
		process.exit(1);
	} finally {
		client.destroy();
		process.exit(0);
	}
}

main();
