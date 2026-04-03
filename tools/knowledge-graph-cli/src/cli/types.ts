import type { GraphService } from "../core/services/graph-service";
import type { EvidenceService } from "../core/services/evidence-service";
import type { ClaimService } from "../core/services/claim-service";
import type { QuestionService } from "../core/services/question-service";
import type { GapService } from "../core/services/gap-service";
import type { LlmTaskService } from "../core/services/llm-task-service";

export interface Services {
	graph: GraphService;
	evidence: EvidenceService;
	claim: ClaimService;
	question: QuestionService;
	gap: GapService;
	llmTask: LlmTaskService;
}
