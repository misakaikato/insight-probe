import type { Command } from "commander";
import { getContext } from "../context";
import type { BaseNode } from "../../core/models/types";
import { markNodeWorkflow } from "../checklist";
import { WORKFLOW_ITEMS } from "../../core/services/task-checklist-service";
import { writeJson, parseJsonFile, parseJsonStdin } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

function getWorkflowItemsForNode(node: BaseNode): string[] {
	switch (node.kind) {
		case "Source":
			return node.text || node.summary ? [WORKFLOW_ITEMS.collectSources] : [];
		case "Evidence":
			return [WORKFLOW_ITEMS.writeGraph];
		case "Claim":
			return [WORKFLOW_ITEMS.extractKnowledge, WORKFLOW_ITEMS.writeGraph];
		case "Question":
		case "Hypothesis":
		case "Gap":
			return [WORKFLOW_ITEMS.synthesizeNextRound];
		case "Entity":
		case "Observation":
		case "Value":
			return [WORKFLOW_ITEMS.extractKnowledge];
		default:
			return [];
	}
}

export function registerNodeCommand(program: Command): void {
	const cmd = program.command("node").description("Manage graph nodes");

	cmd
		.command("get <id>")
		.description("Get a node by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const node = services.graph.getNode(id);
				if (!node) writeError("Not found");
				writeJson(node);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("list")
		.description("List nodes with optional filters")
		.option("--kind <kind>", "Filter by node kind")
		.option("--status <status>", "Filter by status")
		.option("--task <taskId>", "Filter by task ID")
		.action((opts: { kind?: string; status?: string; task?: string }) => {
			try {
				const { services } = getContext();
				const filters: { kind?: string; status?: string; taskId?: string } = {};
				if (opts.kind) filters.kind = opts.kind;
				if (opts.status) filters.status = opts.status;
				if (opts.task) filters.taskId = opts.task;
				const nodes = services.graph.listNodes(filters);
				writeJson(nodes);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("upsert")
		.description("Upsert a node from JSON input")
		.option("--json-in <file>", "JSON file path (use - for stdin)")
		.option("--task <taskId>", "Link the node to a task")
		.action(async (opts: { jsonIn?: string; task?: string }) => {
			try {
				const { services } = getContext();
				let data: Record<string, unknown>;
				if (opts.jsonIn && opts.jsonIn !== "-") {
					data = parseJsonFile<Record<string, unknown>>(opts.jsonIn);
				} else {
					data = await parseJsonStdin<Record<string, unknown>>();
				}
				if (opts.task) {
					data.taskId = opts.task;
				}
				const node = services.graph.upsertNode(
					data as Parameters<typeof services.graph.upsertNode>[0],
				);
				const workflowItems = getWorkflowItemsForNode(node);
				if (workflowItems.length > 0) {
					markNodeWorkflow(services, node, workflowItems);
				}
				writeJson(node);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("delete <id>")
		.description("Delete a node by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const deleted = services.graph.deleteNode(id);
				writeJson({ deleted });
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
