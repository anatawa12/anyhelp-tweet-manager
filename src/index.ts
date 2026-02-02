import process from "node:process";
import {
	Client,
	GatewayIntentBits,
	Partials,
	type Message,
	type MessageReaction,
	type User,
	type PartialUser,
	type PartialMessageReaction,
	ChannelType,
} from "discord.js";
import { loadConfig } from "./config.js";
import { extractTweetUrl, waitForEmbed, detectRetweet, getEmbedAuthorName } from "./utils.js";

// Load configuration
const config = await loadConfig();

// Initialize the client
const client = new Client({
	intents: [
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
	],
	partials: [Partials.Message, Partials.Reaction],
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
 * Handles new messages to detect and process VXT replies
 */
async function handleMessage(message: Message): Promise<void> {
	// Check if message is in a monitored channel
	const channelConfig = config.channels[message.channelId];
	if (!channelConfig) return;

	// Check if message is from VXT bot
	if (message.author.id !== config.vxtBot) return;

	// Check if this is a reply
	if (!message.reference || !message.reference.messageId) return;

	try {
		// Get the original message
		const originalMessage = await message.channel.messages.fetch(message.reference.messageId);

		// Check if original message is from the configured sender
		if (originalMessage.author.id !== channelConfig.sender) return;

		// Extract tweet URL from original message
		const tweetUrl = extractTweetUrl(originalMessage.content);
		if (!tweetUrl) {
			console.log("No tweet URL found in original message");
			return;
		}

		// Wait for embed to be available on VXT reply
		const messageWithEmbed = await waitForEmbed(message);

		if (!messageWithEmbed || messageWithEmbed.embeds.length === 0) {
			console.log("No embed found after waiting");
			return;
		}

		// Get the first embed
		const embed = messageWithEmbed.embeds[0];

		// Detect if it's a retweet
		const retweetStatus = detectRetweet(embed.toJSON());

		if (retweetStatus === "retweet") {
			// React with emoji 1467831704046670080 on original tweet
			await originalMessage.react("1467831704046670080");
			// React with ❌ on VXT reply
			await messageWithEmbed.react("❌");
		} else if (retweetStatus === "unknown") {
			// Report error for manual check
			const vxtMessageLink = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
			await reportError("Cannot determine if tweet is retweet or not. Manual check required.", vxtMessageLink);
		}
		// If it's original, do nothing
	} catch (error) {
		console.error("Error handling message:", error);
		await reportError(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Handles reactions to create threads
 */
async function handleReaction(
	reaction: MessageReaction | PartialMessageReaction,
	user: User | PartialUser,
): Promise<void> {
	// Ignore bot reactions
	if (user.bot) return;

	// Check if reaction is 👀
	if (reaction.emoji.name !== "👀") return;

	// Fetch full reaction and message if partial
	if (reaction.partial) {
		try {
			reaction = await reaction.fetch();
		} catch (error) {
			console.error("Error fetching reaction:", error);
			return;
		}
	}

	const message = reaction.message;

	// Fetch full message if partial
	let fullMessage: Message;
	if (message.partial) {
		try {
			fullMessage = await message.fetch();
		} catch (error) {
			console.error("Error fetching message:", error);
			return;
		}
	} else {
		fullMessage = message as Message;
	}

	// Check if message is in a monitored channel
	const channelConfig = config.channels[fullMessage.channelId];
	if (!channelConfig) return;

	// Check if message is from VXT bot
	if (fullMessage.author.id !== config.vxtBot) return;

	try {
		// Wait for embed if not available
		let messageWithEmbed = fullMessage;
		if (fullMessage.embeds.length === 0) {
			const fetched = await waitForEmbed(fullMessage);
			if (!fetched) {
				console.log("No embed found for thread creation");
				return;
			}
			messageWithEmbed = fetched;
		}

		// Get embed
		if (messageWithEmbed.embeds.length === 0) return;
		const embed = messageWithEmbed.embeds[0];

		// Get author name from embed
		const authorName = getEmbedAuthorName(embed.toJSON());
		if (!authorName) {
			console.log("No author name found in embed");
			return;
		}

		// Create thread with author name
		if (fullMessage.channel.type !== ChannelType.GuildText) {
			console.log("Cannot create thread in non-text channel");
			return;
		}

		const thread = await fullMessage.startThread({
			name: authorName,
			autoArchiveDuration: 60,
		});

		// Send initial message with VXT tweet link
		const messageLink = `https://discord.com/channels/${fullMessage.guildId}/${fullMessage.channelId}/${fullMessage.id}`;
		await thread.send(messageLink);

		// Mention the user to invite them
		await thread.send(`<@${user.id}>`);
	} catch (error) {
		console.error("Error creating thread:", error);
		await reportError(`Error creating thread: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Set up event handlers
client.on("messageCreate", handleMessage);
client.on("messageReactionAdd", handleReaction);

client.on("ready", () => {
	console.log(`Logged in as ${client.user?.tag}`);
});

// Login to the client
await client.login(process.env.DISCORD_TOKEN);
