import type { Command } from "commander";
import { getContext } from "../context";
import { writeJson } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerResearchCommand(program: Command): void {
	const cmd = program.command("research").description("Manage research iteration loop");

	cmd
		.command("continue")
		.description("Continue the research loop for a task")
		.requiredOption("--task <taskId>", "Task ID to continue")
		.option("--max-rounds <number>", "Maximum number of research rounds", "10")
		.action((opts: { task: string; maxRounds: string }) => {
			try {
				const { services } = getContext();
				const maxRounds = parseInt(opts.maxRounds, 10);
				if (isNaN(maxRounds) || maxRounds < 1) {
					writeError("max-rounds must be a positive integer");
				}
				const result = services.research.continue(opts.task, maxRounds);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
