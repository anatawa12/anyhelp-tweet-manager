import process from "node:process";
import { Client, GatewayIntentBits, Partials } from "discord.js";

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

// Login to the client
await client.login(process.env.DISCORD_TOKEN);

//const guild = await client.guilds.fetch("966897185297944629");
// 1166233915409825875/1467738450311647326

const chan = await client.channels.fetch("1166233915409825875");

if (!chan || !chan.isTextBased()) {
	console.error("Channel not found or is not text-based");
	process.exit(1);
}

const msg = await chan.messages.fetch({ message: "1467738450311647326", force: true });

console.log(msg);
console.log(JSON.stringify(msg));

client.on("messageCreate", (message) => {
	console.log(`Message received:`, JSON.stringify(message, null, 2));
});

client.on("messageUpdate", (message) => {
	console.log(`Message updated:`, JSON.stringify(message, null, 2));
});

client.on("messageReactionAdd", (message, user) => {
	console.log(`Message Reaction Added:`, JSON.stringify(message, null, 2), user);
});
