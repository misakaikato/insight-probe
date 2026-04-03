import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { ClaimService } from "../../../src/core/services/claim-service";
import { QuestionService } from "../../../src/core/services/question-service";
import { GapService } from "../../../src/core/services/gap-service";
import { EvidenceService } from "../../../src/core/services/evidence-service";
import { LlmTaskService } from "../../../src/core/services/llm-task-service";
import type { LlmTaskEnvelope } from "../../../src/core/models/types";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestStore(): {
	store: GraphStore;
	graphService: GraphService;
	claimService: ClaimService;
	questionService: QuestionService;
	gapService: GapService;
	evidenceService: EvidenceService;
	cleanup: () => void;
} {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	const evidenceService = new EvidenceService(store, graphService);
	const claimService = new ClaimService(store, graphService);
	const questionService = new QuestionService(store, graphService);
	const gapService = new GapService(store, graphService);
	return {
		store,
		graphService,
		claimService,
		questionService,
		gapService,
		evidenceService,
		cleanup: () => rmSync(dir, { recursive: true }),
	};
}

let context: ReturnType<typeof createTestStore> | null = null;

afterEach(() => {
	if (context) {
		context.cleanup();
		context = null;
	}
});

function validateEnvelope(envelope: LlmTaskEnvelope, expectedTaskType: string) {
	expect(envelope.taskType).toBe(expectedTaskType);
	expect(envelope.graphContext).toBeDefined();
	expect(envelope.graphContext.relatedNodes).toBeInstanceOf(Array);
	expect(envelope.graphContext.relatedEdges).toBeInstanceOf(Array);
	expect(envelope.graphContext.relatedEvidence).toBeInstanceOf(Array);
	expect(typeof envelope.instructions).toBe("string");
	expect(typeof envelope.recommendedPrompt).toBe("string");
	expect(envelope.outputSchema).toBeDefined();
	expect(typeof envelope.outputSchema).toBe("object");
}

describe("LlmTaskService", () => {
	it("should build extract-entities task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		// buildExtractEntitiesTask takes (sourceId, taskId?) positional args
		// It requires a valid Source node, so create one first
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
		});
		const envelope = service.buildExtractEntitiesTask(source.id);
		validateEnvelope(envelope, "extract_entities");
		expect(envelope.inputContext).toBeDefined();
	});

	it("should build extract-claims task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
		});
		const envelope = service.buildExtractClaimsTask(source.id);
		validateEnvelope(envelope, "extract_claims");
	});

	it("should build extract-observations task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
		});
		const envelope = service.buildExtractObservationsTask(source.id);
		validateEnvelope(envelope, "extract_observations");
	});

	it("should build normalize-entities task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		// buildNormalizeEntitiesTask takes (taskId?) positional arg
		const envelope = service.buildNormalizeEntitiesTask();
		validateEnvelope(envelope, "normalize_entities");
	});

	it("should build normalize-claims task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		const envelope = service.buildNormalizeClaimsTask();
		validateEnvelope(envelope, "normalize_claims");
	});

	it("should build generate-questions task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		const envelope = service.buildGenerateQuestionsTask();
		validateEnvelope(envelope, "generate_questions");
	});

	it("should build generate-hypotheses task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		const envelope = service.buildGenerateHypothesesTask();
		validateEnvelope(envelope, "generate_hypotheses");
	});

	it("should build next-search-queries task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		const envelope = service.buildNextSearchQueriesTask();
		validateEnvelope(envelope, "next_search_queries");
	});

	it("should build assess-evidence task envelope", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		// buildAssessEvidenceTask takes (claimId) positional arg
		// It requires a valid Claim node
		const claim = context.claimService.addClaim({ text: "Test claim" });
		const envelope = service.buildAssessEvidenceTask(claim.id);
		validateEnvelope(envelope, "assess_evidence");
	});

	it("should include executionHint when relevant", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
		});
		const envelope = service.buildExtractEntitiesTask(source.id);
		if (envelope.executionHint) {
			expect(typeof envelope.executionHint.suggestedCommand).toBe("string");
		}
	});

	it("should include taskId when provided", () => {
		context = createTestStore();
		const service = new LlmTaskService(
			context.store,
			context.graphService,
			context.claimService,
			context.questionService,
			context.gapService,
			context.evidenceService,
		);
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
		});
		// taskId is the second positional argument
		const envelope = service.buildExtractEntitiesTask(source.id, "task_1");
		expect(envelope.taskId).toBe("task_1");
	});
});
