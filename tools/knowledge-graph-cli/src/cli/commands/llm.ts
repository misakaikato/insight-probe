import type { Command } from "commander";
import { getContext } from "../context";
import { writeJson } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerLlmCommand(program: Command): void {
	const cmd = program.command("llm").description("Build LLM task envelopes for automated extraction and analysis");

	cmd
		.command("extract-entities")
		.description("Build an entity extraction task for a source")
		.requiredOption("--source <id>", "Source node ID")
		.option("--task <taskId>", "Task ID context")
		.action((opts: { source: string; task?: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildExtractEntitiesTask(opts.source, opts.task);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("extract-observations")
		.description("Build an observation extraction task for a source")
		.requiredOption("--source <id>", "Source node ID")
		.option("--task <taskId>", "Task ID context")
		.action((opts: { source: string; task?: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildExtractObservationsTask(opts.source, opts.task);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("extract-claims")
		.description("Build a claim extraction task for a source")
		.requiredOption("--source <id>", "Source node ID")
		.option("--task <taskId>", "Task ID context")
		.action((opts: { source: string; task?: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildExtractClaimsTask(opts.source, opts.task);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("normalize-entities")
		.description("Build an entity normalization task")
		.option("--task <taskId>", "Task ID context")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildNormalizeEntitiesTask(opts.task);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("normalize-claims")
		.description("Build a claim normalization task")
		.option("--task <taskId>", "Task ID context")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildNormalizeClaimsTask(opts.task);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("generate-questions")
		.description("Build a question generation task")
		.option("--task <taskId>", "Task ID context")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildGenerateQuestionsTask(opts.task);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("generate-hypotheses")
		.description("Build a hypothesis generation task")
		.option("--task <taskId>", "Task ID context")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildGenerateHypothesesTask(opts.task);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("next-search-queries")
		.description("Build a next search queries generation task")
		.option("--task <taskId>", "Task ID context")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildNextSearchQueriesTask(opts.task);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("assess-evidence")
		.description("Build an evidence assessment task for a claim")
		.requiredOption("--claim <id>", "Claim node ID")
		.action((opts: { claim: string }) => {
			try {
				const { services } = getContext();
				const envelope = services.llmTask.buildAssessEvidenceTask(opts.claim);
				writeJson(envelope);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
