import type { Client, Message } from "discord.js";
import type { Config } from "./config.js";
import { detectRetweet, extractTweetUrl, waitForEmbed } from "./utils.js";

/**
 * Error reporter function type
 */
export type ErrorReporter = (message: string, link?: string) => Promise<void>;

/**
 * Sends error message to configured error channel (for Discord bot usage)
 */
export async function reportError(client: Client, config: Config, message: string, link?: string): Promise<void> {
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
export async function processVxtMessage(
	client: Client,
	config: Config,
	message: Message,
	channelId: string,
	errorReporter?: ErrorReporter,
): Promise<void> {
	const channelConfig = config.channels[channelId];
	if (!channelConfig) return;

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
			if (errorReporter) {
				await errorReporter("Cannot determine if tweet is retweet or not. Manual check required.", vxtMessageLink);
			} else {
				await reportError(
					client,
					config,
					"Cannot determine if tweet is retweet or not. Manual check required.",
					vxtMessageLink,
				);
			}
		} else {
			console.log(`Original tweet detected, no action taken: ${message.url}`);
			// If it's original, do nothing
		}
	} catch (error) {
		console.error("Error processing message:", error);
		if (errorReporter) {
			await errorReporter(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
		} else {
			await reportError(
				client,
				config,
				`Error processing message: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
