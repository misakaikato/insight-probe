import type { Command } from "commander";
import { getContext } from "../context";
import type { ClaimStatus } from "../../core/models/types";
import { writeJson, parseJsonFile, parseJsonStdin } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerClaimCommand(program: Command): void {
	const cmd = program.command("claim").description("Manage claim nodes");

	cmd
		.command("add")
		.description("Add a new claim")
		.option("--json-in <file>", "JSON file path (use - for stdin)")
		.action(async (opts: { jsonIn?: string }) => {
			try {
				const { services } = getContext();
				let data: {
					text: string;
					claimType?: string;
					status?: ClaimStatus;
					confidence?: number;
					attrs?: Record<string, unknown>;
				};
				if (opts.jsonIn && opts.jsonIn !== "-") {
					data = parseJsonFile<typeof data>(opts.jsonIn);
				} else {
					data = await parseJsonStdin<typeof data>();
				}
				const claim = services.claim.addClaim(data);
				writeJson(claim);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("get <id>")
		.description("Get a claim by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const claim = services.claim.getClaim(id);
				if (!claim) writeError("Not found");
				writeJson(claim);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("list")
		.description("List claims with optional filters")
		.option("--status <status>", "Filter by status")
		.option("--task <taskId>", "Filter by task ID")
		.action((opts: { status?: string; task?: string }) => {
			try {
				const { services } = getContext();
				const filters: { status?: string; taskId?: string } = {};
				if (opts.status) filters.status = opts.status;
				if (opts.task) filters.taskId = opts.task;
				const claims = services.claim.listClaims(filters);
				writeJson(claims);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("set-status <id> <status>")
		.description("Set the status of a claim")
		.action((id: string, status: string) => {
			try {
				const { services } = getContext();
				const claim = services.claim.setClaimStatus(id, status as ClaimStatus);
				if (!claim) writeError("Not found");
				writeJson(claim);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("conflicts <id>")
		.description("Get conflicts for a claim")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const result = services.claim.getConflicts(id);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("merge <id1> <id2>")
		.description("Merge two claims (keeps id1, removes id2)")
		.action((id1: string, id2: string) => {
			try {
				const { services } = getContext();
				const merged = services.claim.mergeClaims(id1, id2);
				writeJson(merged);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
