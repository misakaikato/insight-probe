import type { Command } from "commander";
import { getContext } from "../context";
import { writeJson } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerGraphCommand(program: Command): void {
	const cmd = program.command("graph").description("Graph exploration and analysis");

	cmd
		.command("neighbors <id>")
		.description("Get neighbors of a node")
		.option("--depth <number>", "Traversal depth", parseInt, 1)
		.action((id: string, opts: { depth: number }) => {
			try {
				const { services } = getContext();
				const result = services.graph.getNeighbors(id, opts.depth);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("subgraph")
		.description("Get a subgraph with optional filters")
		.option("--task <taskId>", "Filter by task ID")
		.option("--focus <id>", "Focus node ID")
		.option("--depth <number>", "Expansion depth from focus", parseInt, 2)
		.action((opts: { task?: string; focus?: string; depth: number }) => {
			try {
				const { services } = getContext();
				const filters: { taskId?: string; focusId?: string; depth?: number } = {};
				if (opts.task) filters.taskId = opts.task;
				if (opts.focus) filters.focusId = opts.focus;
				if (opts.depth) filters.depth = opts.depth;
				const result = services.graph.getSubgraph(filters);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("stats")
		.description("Get graph statistics")
		.option("--task <taskId>", "Limit stats to a specific task")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const stats = services.graph.getStats(opts.task);
				writeJson(stats);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("lint")
		.description("Lint the graph for issues")
		.option("--task <taskId>", "Limit linting to a specific task")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const result = services.graph.lint(opts.task);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
