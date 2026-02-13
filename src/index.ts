import process from "node:process";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	type CommandInteraction,
	GatewayIntentBits,
	type Interaction,
	type Message,
	type MessageComponentInteraction,
	type MessageReaction,
	type PartialMessageReaction,
	Partials,
	type PartialUser,
	REST,
	Routes,
	SlashCommandBuilder,
	type ThreadChannel,
	type User,
} from "discord.js";
import { loadConfig } from "./config.js";
import { processVxtMessage, reportError } from "./handlers.js";
import {
	extractStatusFromName,
	formatThreadName,
	isValidTransition,
	STATUS_LABELS,
	STATUS_TRANSITIONS,
	type ThreadStatus,
	updateThreadNameStatus,
} from "./thread-status.js";
import { extractTweetId, getEmbedAuthorName, waitForEmbed } from "./utils.js";

// Constants
const DISCORD_API_VERSION = "10";
const STATUS_BUTTON_CONTENT = "Thread status controls:";

// Load configuration
const config = await loadConfig();

// Track status button messages for each thread
const threadStatusMessages = new Map<string, string>(); // threadId -> messageId

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
 * Creates status transition buttons for a thread
 */
function createStatusButtons(currentStatus: ThreadStatus): ActionRowBuilder<ButtonBuilder> {
	const row = new ActionRowBuilder<ButtonBuilder>();
	const availableTransitions = STATUS_TRANSITIONS[currentStatus] || [];

	for (const nextStatus of availableTransitions) {
		const button = new ButtonBuilder()
			.setCustomId(`status_${nextStatus}`)
			.setLabel(STATUS_LABELS[nextStatus])
			.setStyle(ButtonStyle.Primary);

		row.addComponents(button);
	}

	return row;
}

/**
 * Creates or updates status buttons at the bottom of a thread
 * Deletes old button message if it exists and creates a new one
 */
async function ensureStatusButtonsAtBottom(thread: ThreadChannel, currentStatus: ThreadStatus): Promise<void> {
	// Delete old button message if it exists
	const oldMessageId = threadStatusMessages.get(thread.id);
	if (oldMessageId) {
		try {
			const oldMessage = await thread.messages.fetch(oldMessageId);
			await oldMessage.delete();
		} catch (error) {
			console.error("Error deleting old status button message:", error);
			// If not found, try to find it in recent messages (for restart resilience)
			try {
				const recentMessages = await thread.messages.fetch({ limit: 20 });
				const buttonMessage = recentMessages.find(
					(msg: Message) => msg.author.id === thread.client.user?.id && msg.content === STATUS_BUTTON_CONTENT,
				);
				if (buttonMessage) {
					await buttonMessage.delete();
				}
			} catch (fetchError) {
				console.error("Error fetching recent messages to find button:", fetchError);
			}
		}
	}

	// Create new button message at the bottom
	const buttons = createStatusButtons(currentStatus);
	const message = await thread.send({
		content: STATUS_BUTTON_CONTENT,
		components: buttons.components.length > 0 ? [buttons] : [],
	});

	// Track the new message
	threadStatusMessages.set(thread.id, message.id);
}

/**
 * Handles new messages to detect and process VXT replies
 * Also handles messages in threads to keep buttons at the bottom
 */
async function handleMessage(message: Message): Promise<void> {
	// Skip if this message is from the bot itself
	if (message.author.id === client.user?.id) return;

	// Handle messages in threads - move buttons to bottom
	if (message.channel.isThread()) {
		const currentStatus = extractStatusFromName(message.channel.name);

		// Only handle threads with status tracking
		if (currentStatus) {
			// Move status buttons to the bottom
			await ensureStatusButtonsAtBottom(message.channel, currentStatus);
		}
		return;
	}

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

		// Create thread with author name and initial status
		if (fullMessage.channel.type !== ChannelType.GuildText) {
			console.log("Cannot create thread in non-text channel");
			return;
		}

		const initialStatus: ThreadStatus = "found";
		const thread = await fullMessage.startThread({
			name: formatThreadName(authorName, initialStatus),
		});

		// Send initial message with VXT tweet link
		await thread.send(`https://fxtwitter.com/i/status/${tweetId}`);

		// Mention the user to invite them
		await thread.send(`<@${user.id}>`);

		// Send status control buttons at the bottom
		await ensureStatusButtonsAtBottom(thread, initialStatus);
	} catch (error) {
		console.error("Error creating thread:", error);
		await reportError(
			client,
			config,
			`Error creating thread: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Handles button interactions for status updates
 */
async function handleInteraction(interaction: Interaction): Promise<void> {
	// Handle button interactions
	if (interaction.isButton()) {
		await handleButtonInteraction(interaction);
		return;
	}

	// Handle slash commands
	if (interaction.isChatInputCommand()) {
		await handleCommand(interaction);
		return;
	}
}

/**
 * Handles button clicks for status transitions
 */
async function handleButtonInteraction(interaction: MessageComponentInteraction): Promise<void> {
	// Check if this is a status button
	if (!interaction.customId.startsWith("status_")) return;

	try {
		// Extract new status from button ID
		const newStatus = interaction.customId.replace("status_", "") as ThreadStatus;

		// Get the thread
		const channel = interaction.channel;
		if (!channel || !channel.isThread()) {
			await interaction.reply({
				content: "This command can only be used in threads.",
				ephemeral: true,
			});
			return;
		}

		// Get current status from thread name
		const currentStatus = extractStatusFromName(channel.name);
		if (!currentStatus) {
			await interaction.reply({
				content: "Could not determine current thread status.",
				ephemeral: true,
			});
			return;
		}

		// Validate transition
		if (!isValidTransition(currentStatus, newStatus)) {
			await interaction.reply({
				content: `Invalid status transition from ${currentStatus} to ${newStatus}.`,
				ephemeral: true,
			});
			return;
		}

		// Update thread name with new status
		const newThreadName = updateThreadNameStatus(channel.name, newStatus);
		await channel.setName(newThreadName);

		// Acknowledge the interaction immediately
		await interaction.deferUpdate();

		// Log the status change
		console.log(`Thread ${channel.id} status updated to ${STATUS_LABELS[newStatus]}`);

		// Recreate status buttons at the bottom (this will delete old ones)
		await ensureStatusButtonsAtBottom(channel, newStatus);
	} catch (error) {
		console.error("Error handling button interaction:", error);
		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({
				content: "An error occurred while updating the status.",
				ephemeral: true,
			});
		}
	}
}

/**
 * Handles slash commands
 */
async function handleCommand(interaction: CommandInteraction): Promise<void> {
	if (interaction.commandName === "create-thread") {
		await handleCreateThreadCommand(interaction);
	} else if (interaction.commandName === "add-status-buttons") {
		await handleAddStatusButtonsCommand(interaction);
	}
}

/**
 * Handles the /create-thread command
 */
async function handleCreateThreadCommand(interaction: CommandInteraction): Promise<void> {
	try {
		if (!interaction.isChatInputCommand()) return;

		const threadName = interaction.options.getString("name", true);

		// Check if in a monitored channel
		const channelConfig = config.channels[interaction.channelId];
		if (!channelConfig) {
			await interaction.reply({
				content: "This command can only be used in monitored channels.",
				ephemeral: true,
			});
			return;
		}

		if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
			await interaction.reply({
				content: "This command can only be used in text channels.",
				ephemeral: true,
			});
			return;
		}

		// Create thread with initial status
		const initialStatus: ThreadStatus = "found";
		const thread = await interaction.channel.threads.create({
			name: formatThreadName(threadName, initialStatus),
			reason: `Created by ${interaction.user.tag} via command`,
		});

		// Invite the user to the thread
		await thread.send(`<@${interaction.user.id}>`);

		// Send status control buttons at the bottom
		await ensureStatusButtonsAtBottom(thread, initialStatus);

		await interaction.reply({
			content: `Thread created: <#${thread.id}>`,
			ephemeral: true,
		});
	} catch (error) {
		console.error("Error creating thread via command:", error);
		await interaction.reply({
			content: "An error occurred while creating the thread.",
			ephemeral: true,
		});
	}
}

/**
 * Handles the /add-status-buttons command
 */
async function handleAddStatusButtonsCommand(interaction: CommandInteraction): Promise<void> {
	try {
		// Check if in a thread
		const channel = interaction.channel;
		if (!channel || !channel.isThread()) {
			await interaction.reply({
				content: "This command can only be used in threads.",
				ephemeral: true,
			});
			return;
		}

		// Get current status from thread name
		const currentStatus = extractStatusFromName(channel.name);
		if (!currentStatus) {
			await interaction.reply({
				content: "Could not determine thread status. Please ensure the thread name has a status emoji prefix.",
				ephemeral: true,
			});
			return;
		}

		// Create status buttons at the bottom
		await ensureStatusButtonsAtBottom(channel, currentStatus);

		await interaction.reply({
			content: "Status buttons added successfully!",
			ephemeral: true,
		});
	} catch (error) {
		console.error("Error adding status buttons:", error);
		await interaction.reply({
			content: "An error occurred while adding status buttons.",
			ephemeral: true,
		});
	}
}

// Set up event handlers
client.on("messageCreate", handleMessage);
client.on("messageReactionAdd", handleReaction);
client.on("interactionCreate", handleInteraction);

client.on("clientReady", async () => {
	console.log(`Logged in as ${client.user?.tag}`);

	// Register slash commands
	const commands = [
		new SlashCommandBuilder()
			.setName("create-thread")
			.setDescription("Create a new bug report thread")
			.addStringOption((option) =>
				option.setName("name").setDescription("The name for the thread (without emoji)").setRequired(true),
			),
		new SlashCommandBuilder()
			.setName("add-status-buttons")
			.setDescription("Add status control buttons to an existing thread"),
	];

	const discordToken = process.env.DISCORD_TOKEN;
	const applicationId = process.env.APPLICATION_ID;

	if (!discordToken) {
		console.error("DISCORD_TOKEN environment variable is not set");
		return;
	}

	if (!applicationId) {
		console.error("APPLICATION_ID environment variable is not set");
		return;
	}

	const rest = new REST({ version: DISCORD_API_VERSION }).setToken(discordToken);

	try {
		console.log("Registering slash commands...");
		await rest.put(Routes.applicationGuildCommands(applicationId, config.guild), {
			body: commands,
		});
		console.log("Slash commands registered successfully");
	} catch (error) {
		console.error("Error registering slash commands:", error);
	}
});

// Login to the client
await client.login(process.env.DISCORD_TOKEN);
