export function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
	const ts = new Date().toISOString();
	const prefix = `[${ts}] [${level.toUpperCase()}]`;
	if (data !== undefined) {
		console.error(`${prefix} ${msg}`, typeof data === "object" ? JSON.stringify(data) : data);
	} else {
		console.error(`${prefix} ${msg}`);
	}
}

export function info(msg: string, data?: unknown) {
	log("info", msg, data);
}

export function warn(msg: string, data?: unknown) {
	log("warn", msg, data);
}

export function error(msg: string, data?: unknown) {
	log("error", msg, data);
}
