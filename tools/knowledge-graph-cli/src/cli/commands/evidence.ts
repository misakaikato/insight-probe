import type { Command } from "commander";
import { getContext } from "../context";
import type { EvidenceLinkRole } from "../../core/models/types";
import { markEvidenceLinkWorkflow, markNodeWorkflow } from "../checklist";
import { WORKFLOW_ITEMS } from "../../core/services/task-checklist-service";
import { writeJson, parseJsonFile, parseJsonStdin } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerEvidenceCommand(program: Command): void {
	const cmd = program.command("evidence").description("Manage evidence nodes and links");

	cmd
		.command("add")
		.description("Add a new evidence node")
		.option("--json-in <file>", "JSON file path (use - for stdin)")
		.option("--task <taskId>", "Link the evidence to a task")
		.action(async (opts: { jsonIn?: string; task?: string }) => {
			try {
				const { services } = getContext();
				let data: {
					sourceId: string;
					snippet: string;
					quote?: string;
					locator?: Record<string, unknown>;
					confidence?: number;
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
				const evidence = services.evidence.addEvidence(data);
				markNodeWorkflow(services, evidence, [WORKFLOW_ITEMS.writeGraph]);
				writeJson(evidence);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("get <id>")
		.description("Get an evidence node by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const evidence = services.evidence.getEvidence(id);
				if (!evidence) writeError("Not found");
				writeJson(evidence);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("link")
		.description("Link an evidence node to a target node or edge")
		.requiredOption("--evidence <id>", "Evidence node ID")
		.requiredOption("--target <id>", "Target node or edge ID")
		.requiredOption("--role <role>", "Link role (supports, contradicts, mentions, qualifies)")
		.option("--confidence <number>", "Confidence score (0-1)", parseFloat)
		.option("--target-type <type>", "Target type: node or edge", "node")
		.action((opts: { evidence: string; target: string; role: string; confidence?: number; targetType: string }) => {
			try {
				const { services } = getContext();
				const link = services.evidence.linkEvidence(
					opts.evidence,
					opts.targetType as "node" | "edge",
					opts.target,
					opts.role as EvidenceLinkRole,
					opts.confidence,
				);
				markEvidenceLinkWorkflow(
					services,
					opts.evidence,
					opts.targetType as "node" | "edge",
					opts.target,
					[WORKFLOW_ITEMS.writeGraph],
				);
				writeJson(link);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("list")
		.description("List evidence for a target node or edge")
		.requiredOption("--target <id>", "Target node or edge ID")
		.option("--role <role>", "Filter by link role (supports, contradicts, mentions, qualifies)")
		.action((opts: { target: string; role?: string }) => {
			try {
				const { services } = getContext();
				const result = services.evidence.listEvidenceByTarget(
					opts.target,
					opts.role as EvidenceLinkRole | undefined,
				);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
