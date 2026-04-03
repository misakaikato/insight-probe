#!/usr/bin/env bun
import { Command } from "commander";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GraphStore } from "../storage/graph-store";
import { writeJson } from "../utils/json";
import { initContext, getContext } from "./context";

import { registerNodeCommand } from "./commands/node";
import { registerEdgeCommand } from "./commands/edge";
import { registerSourceCommand } from "./commands/source";
import { registerEvidenceCommand } from "./commands/evidence";
import { registerClaimCommand } from "./commands/claim";
import { registerQuestionCommand } from "./commands/question";
import { registerHypothesisCommand } from "./commands/hypothesis";
import { registerGapCommand } from "./commands/gap";
import { registerGraphCommand } from "./commands/graph";
import { registerTaskCommand } from "./commands/task";
import { registerLlmCommand } from "./commands/llm";

// ── Helpers ──

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

// ── Main program ──

const program = new Command();
program
	.name("kg")
	.description("Knowledge graph CLI for iterative deep research")
	.version("1.0.0")
	.option("--dir <path>", "Research directory path", "./");

// ── new-topic command (does not need --dir) ──

program
	.command("new-topic <topic>")
	.description("Create a new research directory with an empty kg.json")
	.action((topic: string) => {
		try {
			const timestamp = Date.now();
			const dirName = `${topic}_${timestamp}`;
			const dirPath = join(process.cwd(), "temp", dirName);

			if (existsSync(dirPath)) {
				writeError(`Directory already exists: ${dirPath}`);
			}

			mkdirSync(dirPath, { recursive: true });

			const store = new GraphStore(dirPath);
			store.save();

			writeJson({
				topic,
				dir: dirPath,
				file: join(dirPath, "kg.json"),
			});
		} catch (e) {
			writeError((e as Error).message);
		}
	});

// ── Register command groups ──

registerNodeCommand(program);
registerEdgeCommand(program);
registerSourceCommand(program);
registerEvidenceCommand(program);
registerClaimCommand(program);
registerQuestionCommand(program);
registerHypothesisCommand(program);
registerGapCommand(program);
registerGraphCommand(program);
registerTaskCommand(program);
registerLlmCommand(program);

// ── Initialize context before each action (except new-topic) ──

program.hook("preAction", () => {
	const opts = program.opts();
	const dir = opts.dir || "./";
	initContext(dir);
});

// ── Save store after each action ──

program.hook("postAction", () => {
	try {
		const { store } = getContext();
		store.save();
	} catch {
		// Context not initialized (e.g. new-topic command) - skip save
	}
});

program.parse();
