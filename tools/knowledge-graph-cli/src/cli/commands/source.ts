import type { Command } from "commander";
import { getContext } from "../context";
import { markNodeWorkflow } from "../checklist";
import { WORKFLOW_ITEMS } from "../../core/services/task-checklist-service";
import { writeJson, parseJsonFile, parseJsonStdin } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerSourceCommand(program: Command): void {
	const cmd = program.command("source").description("Manage evidence sources");

	cmd
		.command("add")
		.description("Add a new source")
		.option("--json-in <file>", "JSON file path (use - for stdin)")
		.option("--task <taskId>", "Link the source to a task")
		.action(async (opts: { jsonIn?: string; task?: string }) => {
			try {
				const { services } = getContext();
				let data: {
					title: string;
					uri?: string;
					sourceType: string;
					text?: string;
					summary?: string;
					attrs?: Record<string, unknown>;
					taskId?: string;
				};
				if (opts.jsonIn && opts.jsonIn !== "-") {
					data = parseJsonFile<typeof data>(opts.jsonIn);
				} else {
					data = await parseJsonStdin<typeof data>();
				}
				if (opts.task) {
					data.taskId = opts.task;
				}
				const source = services.evidence.addSource(data);
				if (source.text || source.summary) {
					markNodeWorkflow(services, source, [WORKFLOW_ITEMS.collectSources]);
				}
				writeJson(source);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("update <id>")
		.description("Update an existing source")
		.option("--json-in <file>", "JSON file path (use - for stdin)")
		.option("--task <taskId>", "Link the source to a task while updating")
		.action(async (id: string, opts: { jsonIn?: string; task?: string }) => {
			try {
				const { services } = getContext();
				let data: {
					title?: string;
					uri?: string;
					sourceType?: string;
					text?: string;
					summary?: string;
					attrs?: Record<string, unknown>;
					taskId?: string;
				};
				if (opts.jsonIn && opts.jsonIn !== "-") {
					data = parseJsonFile<typeof data>(opts.jsonIn);
				} else {
					data = await parseJsonStdin<typeof data>();
				}
				if (opts.task) {
					data.taskId = opts.task;
				}
				const source = services.evidence.updateSource(id, data);
				if (source.text || source.summary) {
					markNodeWorkflow(services, source, [WORKFLOW_ITEMS.collectSources]);
				}
				writeJson(source);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("get <id>")
		.description("Get a source by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const source = services.evidence.getSource(id);
				if (!source) writeError("Not found");
				writeJson(source);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
