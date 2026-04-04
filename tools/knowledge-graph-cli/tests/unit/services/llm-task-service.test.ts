import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { ClaimService } from "../../../src/core/services/claim-service";
import { QuestionService } from "../../../src/core/services/question-service";
import { GapService } from "../../../src/core/services/gap-service";
import { EvidenceService } from "../../../src/core/services/evidence-service";
import { LlmTaskService } from "../../../src/core/services/llm-task-service";
import { TaskChecklistService } from "../../../src/core/services/task-checklist-service";
import type { LlmTaskEnvelope } from "../../../src/core/models/types";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateId } from "../../../src/utils/ids";
import { now } from "../../../src/utils/time";

function createTestStore(): {
	store: GraphStore;
	graphService: GraphService;
	claimService: ClaimService;
	questionService: QuestionService;
	gapService: GapService;
	evidenceService: EvidenceService;
	taskChecklistService: TaskChecklistService;
	cleanup: () => void;
} {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	const evidenceService = new EvidenceService(store, graphService);
	const claimService = new ClaimService(store, graphService);
	const questionService = new QuestionService(store, graphService);
	const gapService = new GapService(store, graphService);
	const taskChecklistService = new TaskChecklistService(store);
	return {
		store,
		graphService,
		claimService,
		questionService,
		gapService,
		evidenceService,
		taskChecklistService,
		cleanup: () => rmSync(dir, { recursive: true }),
	};
}

function createTask(context: ReturnType<typeof createTestStore>) {
	const task = {
		id: generateId("Task"),
		title: "Test Task",
		goal: "Test Goal",
		status: "active" as const,
		attrs: {},
		createdAt: now(),
		updatedAt: now(),
	};
	context.store.createTask(task);
	context.store.save();
	context.taskChecklistService.initializeTask(task.id);
	return task;
}

function createService(context: ReturnType<typeof createTestStore>) {
	return new LlmTaskService(
		context.store,
		context.graphService,
		context.claimService,
		context.questionService,
		context.gapService,
		context.evidenceService,
		context.taskChecklistService,
	);
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
		const service = createService(context);
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
		const service = createService(context);
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
		});
		const envelope = service.buildExtractClaimsTask(source.id);
		validateEnvelope(envelope, "extract_claims");
	});

	it("should build extract-observations task envelope", () => {
		context = createTestStore();
		const service = createService(context);
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
		});
		const envelope = service.buildExtractObservationsTask(source.id);
		validateEnvelope(envelope, "extract_observations");
	});

	it("should build normalize-entities task envelope", () => {
		context = createTestStore();
		const service = createService(context);
		const envelope = service.buildNormalizeEntitiesTask();
		validateEnvelope(envelope, "normalize_entities");
	});

	it("should build normalize-claims task envelope", () => {
		context = createTestStore();
		const service = createService(context);
		const envelope = service.buildNormalizeClaimsTask();
		validateEnvelope(envelope, "normalize_claims");
	});

	it("should build generate-questions task envelope", () => {
		context = createTestStore();
		const service = createService(context);
		const envelope = service.buildGenerateQuestionsTask();
		validateEnvelope(envelope, "generate_questions");
	});

	it("should build generate-hypotheses task envelope", () => {
		context = createTestStore();
		const service = createService(context);
		const envelope = service.buildGenerateHypothesesTask();
		validateEnvelope(envelope, "generate_hypotheses");
	});

	it("should build next-search-queries task envelope", () => {
		context = createTestStore();
		const service = createService(context);
		const envelope = service.buildNextSearchQueriesTask();
		validateEnvelope(envelope, "next_search_queries");
	});

	it("should build assess-evidence task envelope", () => {
		context = createTestStore();
		const service = createService(context);
		const claim = context.claimService.addClaim({ text: "Test claim" });
		const envelope = service.buildAssessEvidenceTask(claim.id);
		validateEnvelope(envelope, "assess_evidence");
	});

	it("should include executionHint when relevant", () => {
		context = createTestStore();
		const service = createService(context);
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
		const service = createService(context);
		const task = createTask(context);
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
			taskId: task.id,
		});
		const envelope = service.buildExtractEntitiesTask(source.id, task.id);
		expect(envelope.taskId).toBe(task.id);
		expect(envelope.inputContext.workflowChecklist).toBeDefined();
		expect(envelope.recommendedPrompt).toContain("外置流程记忆");
	});
});
