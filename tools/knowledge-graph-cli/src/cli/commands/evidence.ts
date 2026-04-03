import type { Command } from "commander";
import { getContext } from "../context";
import type { EvidenceLinkRole } from "../../core/models/types";
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
		.action(async (opts: { jsonIn?: string }) => {
			try {
				const { services } = getContext();
				let data: {
					sourceId: string;
					snippet: string;
					quote?: string;
					locator?: Record<string, unknown>;
					confidence?: number;
					attrs?: Record<string, unknown>;
				};
				if (opts.jsonIn && opts.jsonIn !== "-") {
					data = parseJsonFile<typeof data>(opts.jsonIn);
				} else {
					data = await parseJsonStdin<typeof data>();
				}
				const evidence = services.evidence.addEvidence(data);
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
				writeJson(link);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("list")
		.description("List evidence for a target node or edge")
		.requiredOption("--target <id>", "Target node or edge ID")
		.action((opts: { target: string }) => {
			try {
				const { services } = getContext();
				const result = services.evidence.listEvidenceByTarget(opts.target);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
