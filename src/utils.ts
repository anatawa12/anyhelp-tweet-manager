import { Embed, Message } from "discord.js";

/**
 * Extracts tweet ID from a Twitter/X URL
 * @param url - Twitter or X URL
 * @returns Tweet ID or null if not found
 */
export function extractTweetId(url: string): string | null {
	// Match patterns like:
	// https://twitter.com/username/status/123456789
	// https://x.com/username/status/123456789
	// https://fxtwitter.com/username/status/123456789
	// https://fxtwitter.com/i/status/123456789/
	const match = url.match(/\/status\/(\d+)/);
	return match ? match[1] : null;
}

/**
 * Extracts tweet URL from message content
 * @param content - Message content
 * @returns Tweet URL or null if not found
 */
export function extractTweetUrl(content: string): string | null {
	// Match URL within angle brackets: <https://twitter.com/...>
	const match = content.match(/<(https?:\/\/(?:twitter|x)\.com\/\S+)>/);
	return match ? match[1] : null;
}

/**
 * Checks if a tweet is a retweet by comparing tweet IDs
 * @param embed - Discord embed from fxtwitter
 * @returns "retweet" | "original" | "unknown"
 */
export function detectRetweet(tweetUrl: string, embed: Embed): "retweet" | "original" | "unknown" {
	// Get tweet ID from embed root URL
	const rootUrl = embed.url;
	if (!rootUrl) return "unknown";

	const rootTweetId = extractTweetId(rootUrl);
	if (!rootTweetId) return "unknown";

	// Get tweet ID from source URL in the message content
	const contentTweetId = extractTweetId(tweetUrl);
	if (!contentTweetId) return "unknown";

	// If IDs are different, it's a retweet
	return rootTweetId === contentTweetId ? "original" : "retweet";
}

/**
 * Waits for embed to be available on a message
 * @param message - Discord message
 * @returns Message with embed or null if not found
 */
export async function waitForEmbed(message: Message): Promise<Message | null> {
	if (message.embeds.length > 0) {
		return message;
	}

	await new Promise((resolve) => setTimeout(resolve, 1000));
	let fetchedMessage = await message.channel.messages.fetch(message.id);

	if (fetchedMessage.embeds.length > 0) {
		return fetchedMessage;
	}

	// Wait 5 seconds and fetch
	await new Promise((resolve) => setTimeout(resolve, 5000));

	fetchedMessage = await message.channel.messages.fetch(message.id);

	if (fetchedMessage.embeds.length > 0) {
		return fetchedMessage;
	}

	// Wait another 10 seconds and try again
	await new Promise((resolve) => setTimeout(resolve, 10000));

	fetchedMessage = await message.channel.messages.fetch(message.id);

	if (fetchedMessage.embeds.length > 0) {
		return fetchedMessage;
	}

	return null;
}

/**
 * Gets the author name from embed
 * @param embed - Discord embed
 * @returns Author name or null
 */
export function getEmbedAuthorName(embed: Embed): string | null {
	return embed.author?.name || null;
}
