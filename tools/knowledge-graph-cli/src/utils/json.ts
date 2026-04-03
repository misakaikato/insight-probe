import { readFileSync } from "node:fs";

export function parseJsonFile<T>(filePath: string): T {
	const raw = readFileSync(filePath, "utf-8");
	return JSON.parse(raw) as T;
}

export function parseJsonStdin<T>(): Promise<T> {
	return new Promise((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf-8");
		process.stdin.on("data", (chunk: string) => (data += chunk));
		process.stdin.on("end", () => {
			try {
				resolve(JSON.parse(data) as T);
			} catch (e) {
				reject(new Error(`Invalid JSON from stdin: ${(e as Error).message}`));
			}
		});
		process.stdin.on("error", reject);
	});
}

export function writeJson(value: unknown, filePath?: string) {
	const json = JSON.stringify(value, null, 2);
	if (filePath) {
		const { mkdirSync } = require("node:fs");
		const { dirname } = require("node:path");
		mkdirSync(dirname(filePath), { recursive: true });
		require("node:fs").writeFileSync(filePath, json + "\n");
	} else {
		console.log(json);
	}
}
