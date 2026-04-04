import type { Command } from "commander";
import { getContext } from "../context";
import { markEdgeWorkflow } from "../checklist";
import { WORKFLOW_ITEMS } from "../../core/services/task-checklist-service";
import { writeJson } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerEdgeCommand(program: Command): void {
	const cmd = program.command("edge").description("Manage graph edges");

	cmd
		.command("create")
		.description("Create a new edge")
		.requiredOption("--from <id>", "Source node ID")
		.requiredOption("--type <type>", "Edge type")
		.requiredOption("--to <id>", "Target node ID")
		.option("--confidence <number>", "Confidence score (0-1)", parseFloat)
		.option("--undirected", "Make the edge undirected", false)
		.action((opts: { from: string; type: string; to: string; confidence?: number; undirected?: boolean }) => {
			try {
				const { services } = getContext();
				const edge = services.graph.createEdge({
					fromId: opts.from,
					toId: opts.to,
					type: opts.type,
					directed: !opts.undirected,
					confidence: opts.confidence,
				});
				markEdgeWorkflow(services, edge, [
					WORKFLOW_ITEMS.extractKnowledge,
					WORKFLOW_ITEMS.writeGraph,
				]);
				writeJson(edge);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("get <id>")
		.description("Get an edge by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const edge = services.graph.getEdge(id);
				if (!edge) writeError("Not found");
				writeJson(edge);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("list")
		.description("List edges with optional filters")
		.option("--from <id>", "Filter by source node ID")
		.option("--to <id>", "Filter by target node ID")
		.option("--type <type>", "Filter by edge type")
		.action((opts: { from?: string; to?: string; type?: string }) => {
			try {
				const { services } = getContext();
				const filters: { fromId?: string; toId?: string; type?: string } = {};
				if (opts.from) filters.fromId = opts.from;
				if (opts.to) filters.toId = opts.to;
				if (opts.type) filters.type = opts.type;
				const edges = services.graph.listEdges(filters);
				writeJson(edges);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("delete <id>")
		.description("Delete an edge by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const deleted = services.graph.deleteEdge(id);
				writeJson({ deleted });
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
