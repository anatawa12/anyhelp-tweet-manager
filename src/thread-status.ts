/**
 * Thread status management for bug report tracking
 */

export type ThreadStatus = "found" | "asked" | "waiting" | "investigating" | "unreleased" | "fixed" | "closed";

export const STATUS_EMOJIS: Record<ThreadStatus, string> = {
	found: "🔍",
	asked: "❓",
	waiting: "🔄",
	investigating: "🛠️",
	unreleased: "📦",
	fixed: "✅",
	closed: "🔒",
};

export const STATUS_LABELS: Record<ThreadStatus, string> = {
	found: "Found",
	asked: "Asked",
	waiting: "Waiting",
	investigating: "Investigating",
	unreleased: "Unreleased",
	fixed: "Fixed",
	closed: "Closed",
};

/**
 * Defines valid status transitions
 * Key: current status, Value: array of allowed next statuses
 */
export const STATUS_TRANSITIONS: Record<ThreadStatus, ThreadStatus[]> = {
	found: ["asked", "investigating"],
	asked: ["waiting", "investigating", "closed"],
	waiting: ["asked", "investigating", "unreleased", "fixed"],
	investigating: ["asked", "waiting", "unreleased", "closed"],
	unreleased: ["asked", "waiting", "investigating", "fixed"],
	fixed: ["asked", "waiting", "investigating", "closed"],
	closed: [],
};

/**
 * Get the formatted thread name with status emoji
 */
export function formatThreadName(authorName: string, status: ThreadStatus = "found"): string {
	const emoji = STATUS_EMOJIS[status];
	return `${emoji} ${authorName}`;
}

/**
 * Extract status from thread name
 */
export function extractStatusFromName(threadName: string): ThreadStatus | null {
	for (const [status, emoji] of Object.entries(STATUS_EMOJIS)) {
		if (threadName.startsWith(emoji)) {
			return status as ThreadStatus;
		}
	}
	return null;
}

/**
 * Update thread name with new status
 */
export function updateThreadNameStatus(currentName: string, newStatus: ThreadStatus): string {
	// Remove old status emoji if present
	const currentStatus = extractStatusFromName(currentName);
	let baseName = currentName;

	if (currentStatus) {
		const oldEmoji = STATUS_EMOJIS[currentStatus];
		baseName = currentName.replace(oldEmoji, "").trim();
	}

	// Add new status emoji
	return formatThreadName(baseName, newStatus);
}

/**
 * Check if a status transition is valid
 */
export function isValidTransition(from: ThreadStatus, to: ThreadStatus): boolean {
	return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
