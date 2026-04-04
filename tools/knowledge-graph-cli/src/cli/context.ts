import { GraphStore } from "../storage/graph-store";
import type { Services } from "./types";
import { GraphService } from "../core/services/graph-service";
import { EvidenceService } from "../core/services/evidence-service";
import { ClaimService } from "../core/services/claim-service";
import { QuestionService } from "../core/services/question-service";
import { GapService } from "../core/services/gap-service";
import { LlmTaskService } from "../core/services/llm-task-service";
import { ReportService } from "../core/services/report-service";
import { ResearchService } from "../core/services/research-service";

export interface AppContext {
	store: GraphStore;
	services: Services;
}

let _ctx: AppContext | null = null;

export function getContext(): AppContext {
	if (!_ctx) throw new Error("AppContext not initialized");
	return _ctx;
}

function createServices(store: GraphStore): Services {
	const graph = new GraphService(store);
	const evidence = new EvidenceService(store, graph);
	const claim = new ClaimService(store, graph);
	const question = new QuestionService(store, graph);
	const gap = new GapService(store, graph);
	const llmTask = new LlmTaskService(store, graph, claim, question, gap, evidence);
	const report = new ReportService(store, graph, evidence);
	const research = new ResearchService(store, graph, llmTask, question, gap);
	return { graph, evidence, claim, question, gap, llmTask, report, research };
}

export function initContext(dir: string): AppContext {
	const store = new GraphStore(dir);
	const services = createServices(store);
	_ctx = { store, services };
	return _ctx;
}

export function clearContext(): void {
	_ctx = null;
}
