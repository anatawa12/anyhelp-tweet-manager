import process from "node:process";
import { Command } from "commander";
import { Client, GatewayIntentBits, type Message, Partials } from "discord.js";
import { loadConfig } from "./config.js";
import { processVxtMessage } from "./handlers.js";

const program = new Command();

program
	.name("process-rt")
	.description("Process RT detection for existing messages on a channel")
	.requiredOption("-c, --channel <channelId>", "Channel ID to process")
	.requiredOption("-n, --count <number>", "Number of messages to process", parseInt)
	.option("-b, --before <messageId>", "Only process messages older than this message ID")
	.parse(process.argv);

const options = program.opts<{ channel: string; count: number; before?: string }>();

// Validate count
if (options.count <= 0 || !Number.isInteger(options.count)) {
	console.error("Error: count must be a positive integer");
	process.exit(1);
}

// Validate before
if (options.before !== undefined && !/^\d+$/.test(options.before)) {
	console.error("Error: before must be a message ID");
	process.exit(1);
}

/** The command line options to resume from the current point; updated as messages are processed */
let resumeHint: string | undefined;

function printResumeHint() {
	if (resumeHint) console.log(`To resume: ${resumeHint}`);
}

process.on("SIGINT", () => {
	console.log("\nInterrupted.");
	printResumeHint();
	process.exit(130);
});

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
 * Main function to process RT detection
 */
async function main() {
	console.log("Connecting to Discord...");

	await client.login(process.env.DISCORD_TOKEN);

	console.log(`Logged in as ${client.user?.tag}`);
	console.log(
		`Processing last ${options.count} messages in channel ${options.channel}` +
			`${options.before ? ` before ${options.before}` : ""}...`,
	);

	try {
		// Fetch the channel
		const channel = await client.channels.fetch(options.channel);

		if (!channel?.isTextBased() || channel.isDMBased()) {
			console.error("Error: Channel not found or is not a text channel");
			process.exit(1);
		}

		// Fetch messages with pagination support
		console.log(`Fetching up to ${options.count} messages...`);
		const allMessages = new Map<string, Message>();
		let remaining = options.count;
		let lastMessageId: string | undefined = options.before;

		while (remaining > 0) {
			const batchSize = Math.min(remaining, 100);
			const fetchOptions: { limit: number; before?: string } = { limit: batchSize };
			if (lastMessageId) {
				fetchOptions.before = lastMessageId;
			}

			const batch = await channel.messages.fetch(fetchOptions);
			if (batch.size === 0) break; // No more messages available

			// Add messages to the collection
			for (const [id, msg] of batch) {
				allMessages.set(id, msg);
			}

			remaining -= batch.size;
			lastMessageId = batch.last()?.id;

			console.log(`Fetched ${allMessages.size} messages so far...`);

			// If we got fewer messages than requested, we've reached the end
			if (batch.size < batchSize) break;
		}

		console.log(`Fetched ${allMessages.size} messages total`);

		// Filter messages from VXT bot that are replies
		const vxtMessages = Array.from(allMessages.values()).filter(
			(msg) => msg.author.id === config.vxtBot && msg.reference,
		);

		console.log(`Found ${vxtMessages.length} VXT reply messages to process`);

		// Index of each message in the fetched list (newest first), used to compute the remaining count
		const fetchedIds = Array.from(allMessages.keys());

		// Process each message sequentially to avoid Discord API rate limits
		for (let i = 0; i < vxtMessages.length; i++) {
			const message = vxtMessages[i];
			console.log(`Processing message ${i + 1}/${vxtMessages.length} (${message.id})...`);
			// Use stderr-only error reporter for CLI - do not send to Discord
			await processVxtMessage(client, config, message, options.channel, async (msg, link) => {
				console.error(`Error: ${msg}${link ? ` - ${link}` : ""}`);
			});

			const remainingCount = options.count - (fetchedIds.indexOf(message.id) + 1);
			resumeHint = remainingCount > 0 ? `-c ${options.channel} -n ${remainingCount} -b ${message.id}` : undefined;
			console.log(`  done.${resumeHint ? ` resume: ${resumeHint}` : ""}`);
		}

		console.log("Processing complete!");
	} catch (error) {
		console.error("Error:", error);
		printResumeHint();
		process.exit(1);
	} finally {
		client.destroy();
		process.exit(0);
	}
}

main();
