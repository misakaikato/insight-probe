import type { Command } from "commander";
import { getContext } from "../context";
import { writeJson } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerGapCommand(program: Command): void {
	const cmd = program.command("gap").description("Detect and list knowledge gaps");

	cmd
		.command("detect")
		.description("Detect knowledge gaps")
		.option("--task <taskId>", "Limit detection to a specific task")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const gaps = services.gap.detectGaps(opts.task);
				writeJson(gaps);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("list")
		.description("List detected gaps")
		.option("--status <status>", "Filter by status")
		.option("--task <taskId>", "Filter by task ID")
		.action((opts: { status?: string; task?: string }) => {
			try {
				const { services } = getContext();
				const filters: { taskId?: string; status?: string } = {};
				if (opts.task) filters.taskId = opts.task;
				if (opts.status) filters.status = opts.status;
				const gaps = services.gap.listGaps(filters);
				writeJson(gaps);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
