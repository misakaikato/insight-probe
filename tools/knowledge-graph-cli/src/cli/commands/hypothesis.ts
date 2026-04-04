import type { Command } from "commander";
import { getContext } from "../context";
import { markNodeWorkflow } from "../checklist";
import { WORKFLOW_ITEMS } from "../../core/services/task-checklist-service";
import { writeJson, parseJsonFile, parseJsonStdin } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerHypothesisCommand(program: Command): void {
	const cmd = program.command("hypothesis").description("Manage hypothesis nodes");

	cmd
		.command("add")
		.description("Add a new hypothesis")
		.option("--json-in <file>", "JSON file path (use - for stdin)")
		.option("--task <taskId>", "Link the hypothesis to a task")
		.action(async (opts: { jsonIn?: string; task?: string }) => {
			try {
				const { services } = getContext();
				let data: Record<string, unknown>;
				if (opts.jsonIn && opts.jsonIn !== "-") {
					data = parseJsonFile<Record<string, unknown>>(opts.jsonIn);
				} else {
					data = await parseJsonStdin<Record<string, unknown>>();
				}
				// Force kind to Hypothesis
				data.kind = "Hypothesis";
				if (opts.task) {
					data.taskId = opts.task;
				}
				const hypothesis = services.graph.upsertNode(
					data as Parameters<typeof services.graph.upsertNode>[0],
				);
				markNodeWorkflow(services, hypothesis, [WORKFLOW_ITEMS.synthesizeNextRound]);
				writeJson(hypothesis);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
