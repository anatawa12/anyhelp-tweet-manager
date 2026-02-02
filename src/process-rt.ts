import process from "node:process";
import { Command } from "commander";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { loadConfig } from "./config.js";
import { processVxtMessage } from "./handlers.js";

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
			// Use stderr-only error reporter for CLI - do not send to Discord
			await processVxtMessage(client, config, message, options.channel, async (msg, link) => {
				console.error(`Error: ${msg}${link ? ` - ${link}` : ""}`);
			});
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
