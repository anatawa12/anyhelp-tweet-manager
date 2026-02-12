import process from "node:process";
import {
	ChannelType,
	Client,
	GatewayIntentBits,
	type Message,
	type MessageReaction,
	type PartialMessageReaction,
	Partials,
	type PartialUser,
	type User,
} from "discord.js";
import { loadConfig } from "./config.js";
import { processVxtMessage, reportError } from "./handlers.js";
import { extractTweetId, getEmbedAuthorName, waitForEmbed } from "./utils.js";

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
 * Handles new messages to detect and process VXT replies
 */
async function handleMessage(message: Message): Promise<void> {
	// Check if message is in a monitored channel
	const channelConfig = config.channels[message.channelId];
	if (!channelConfig) return;

	// Check if message is from VXT bot
	if (message.author.id !== config.vxtBot) return;

	// Process the VXT message
	await processVxtMessage(client, config, message, message.channelId);
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
		fullMessage = message;
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
		const authorName = getEmbedAuthorName(embed);
		if (!authorName) {
			console.log("No author name found in embed");
			return;
		}

		const tweetId = extractTweetId(fullMessage.content);

		// Create thread with author name
		if (fullMessage.channel.type !== ChannelType.GuildText) {
			console.log("Cannot create thread in non-text channel");
			return;
		}

		const thread = await fullMessage.startThread({
			name: authorName,
		});

		// Send initial message with VXT tweet link
		await thread.send(`https://fxtwitter.com/i/status/${tweetId}`);

		// Mention the user to invite them
		await thread.send(`<@${user.id}>`);
	} catch (error) {
		console.error("Error creating thread:", error);
		await reportError(
			client,
			config,
			`Error creating thread: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

// Set up event handlers
client.on("messageCreate", handleMessage);
client.on("messageReactionAdd", handleReaction);

client.on("clientReady", () => {
	console.log(`Logged in as ${client.user?.tag}`);
});

// Login to the client
await client.login(process.env.DISCORD_TOKEN);
