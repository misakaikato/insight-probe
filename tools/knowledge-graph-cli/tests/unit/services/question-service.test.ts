import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { QuestionService } from "../../../src/core/services/question-service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestStore(): { store: GraphStore; graphService: GraphService; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	return { store, graphService, cleanup: () => rmSync(dir, { recursive: true }) };
}

let context: ReturnType<typeof createTestStore> | null = null;

afterEach(() => {
	if (context) {
		context.cleanup();
		context = null;
	}
});

describe("QuestionService", () => {
	it("should create a question via addQuestion", () => {
		context = createTestStore();
		const service = new QuestionService(context.store, context.graphService);
		// priority and questionType are top-level fields, not inside attrs
		const question = service.addQuestion({
			text: "Are there independent evaluations?",
			questionType: "verification",
			priority: 0.8,
		});
		expect(question.id).toMatch(/^q_/);
		expect(question.kind).toBe("Question");
		expect(question.text).toBe("Are there independent evaluations?");
		expect(question.status).toBe("open");
	});

	it("should list questions with no filter", () => {
		context = createTestStore();
		const service = new QuestionService(context.store, context.graphService);
		service.addQuestion({ text: "Q1" });
		service.addQuestion({ text: "Q2" });
		// listQuestions requires a filters argument
		expect(service.listQuestions({})).toHaveLength(2);
	});

	it("should list questions filtered by status", () => {
		context = createTestStore();
		const service = new QuestionService(context.store, context.graphService);
		service.addQuestion({ text: "Q1" });
		const q2 = service.addQuestion({ text: "Q2" });
		service.setQuestionStatus(q2.id, "resolved");

		const open = service.listQuestions({ status: "open" });
		expect(open).toHaveLength(1);
	});

	it("should change question status via setQuestionStatus", () => {
		context = createTestStore();
		const service = new QuestionService(context.store, context.graphService);
		const question = service.addQuestion({ text: "Q1" });
		expect(question.status).toBe("open");

		const updated = service.setQuestionStatus(question.id, "in_progress");
		expect(updated?.status).toBe("in_progress");
	});

	it("should throw when setting invalid status", () => {
		context = createTestStore();
		const service = new QuestionService(context.store, context.graphService);
		const question = service.addQuestion({ text: "Q1" });
		expect(() => service.setQuestionStatus(question.id, "invalid" as any)).toThrow();
	});
});
