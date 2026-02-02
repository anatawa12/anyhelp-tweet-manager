import { readFile } from "node:fs/promises";
import { z } from "zod";

const ConfigSchema = z.object({
	vxtBot: z.string(),
	guild: z.string(),
	errorChannel: z.string().nullable(),
	retweetReaction: z.string(),
	channels: z.record(
		z.string(),
		z.object({
			sender: z.string().nullable(),
		}),
	),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(): Promise<Config> {
	const content = await readFile("settings.json", "utf-8");
	const data = JSON.parse(content);
	return ConfigSchema.parse(data);
}
