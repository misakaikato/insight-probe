import { describe, it, expect } from "vitest";
import {
	EntitySchema,
	ClaimSchema,
	SourceSchema,
	EvidenceSchema,
	QuestionSchema,
	NodeKindSchema,
	BaseNodeSchema,
	ClaimStatusSchema,
	QuestionStatusSchema,
	EdgeSchema,
	EvidenceLinkSchema,
	OpLogSchema,
	TaskSchema,
} from "../../src/core/schemas/index";

const now = new Date().toISOString();

// ── NodeKind ──

describe("NodeKindSchema", () => {
	it("should accept valid node kinds", () => {
		for (const kind of [
			"Entity",
			"Claim",
			"Source",
			"Evidence",
			"Observation",
			"Question",
			"Hypothesis",
			"Gap",
			"Task",
			"Value",
		]) {
			expect(NodeKindSchema.parse(kind)).toBe(kind);
		}
	});

	it("should reject invalid node kind", () => {
		expect(() => NodeKindSchema.parse("Invalid")).toThrow();
	});
});

// ── EntitySchema ──

describe("EntitySchema", () => {
	it("should accept a valid entity", () => {
		const entity = {
			id: "ent_1",
			kind: "Entity" as const,
			type: "Person",
			title: "OpenAI",
			attrs: { aliases: ["OpenAI Inc."] },
			createdAt: now,
			updatedAt: now,
		};
		const result = EntitySchema.parse(entity);
		expect(result.kind).toBe("Entity");
		expect(result.type).toBe("Person");
		expect(result.title).toBe("OpenAI");
	});

	it("should accept entity with default attrs", () => {
		const entity = {
			id: "ent_1",
			kind: "Entity" as const,
			type: "Person",
			title: "Test",
			createdAt: now,
			updatedAt: now,
		};
		const result = EntitySchema.parse(entity);
		// BaseNodeSchema sets attrs default to {}
		expect(result.attrs).toEqual({});
	});

	it("should reject entity without required type", () => {
		const entity = {
			id: "ent_1",
			kind: "Entity",
			title: "Test",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => EntitySchema.parse(entity)).toThrow();
	});

	it("should reject entity without required title", () => {
		const entity = {
			id: "ent_1",
			kind: "Entity",
			type: "Person",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => EntitySchema.parse(entity)).toThrow();
	});

	it("should reject entity with wrong kind", () => {
		const entity = {
			id: "ent_1",
			kind: "Claim",
			type: "Person",
			title: "Test",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => EntitySchema.parse(entity)).toThrow();
	});

	it("should reject entity with confidence out of range", () => {
		const entity = {
			id: "ent_1",
			kind: "Entity",
			type: "Person",
			title: "Test",
			confidence: 1.5,
			createdAt: now,
			updatedAt: now,
		};
		expect(() => EntitySchema.parse(entity)).toThrow();
	});
});

// ── ClaimSchema ──

describe("ClaimSchema", () => {
	it("should accept a valid claim", () => {
		const claim = {
			id: "clm_1",
			kind: "Claim" as const,
			text: "Gemma 4 achieves 85% on MMLU Pro",
			status: "supported",
			attrs: { claimType: "benchmark_result" },
			createdAt: now,
			updatedAt: now,
		};
		const result = ClaimSchema.parse(claim);
		expect(result.kind).toBe("Claim");
		expect(result.text).toBe("Gemma 4 achieves 85% on MMLU Pro");
		expect(result.status).toBe("supported");
	});

	it("should accept claim with valid time", () => {
		const claim = {
			id: "clm_1",
			kind: "Claim" as const,
			text: "Some claim",
			status: "proposed" as const,
			attrs: {
				validTime: { start: "2026-01-01", end: null },
			},
			createdAt: now,
			updatedAt: now,
		};
		const result = ClaimSchema.parse(claim);
		expect(result.attrs.validTime).toEqual({ start: "2026-01-01", end: null });
	});

	it("should reject claim without required text", () => {
		const claim = {
			id: "clm_1",
			kind: "Claim",
			status: "proposed",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => ClaimSchema.parse(claim)).toThrow();
	});

	it("should reject claim with invalid status", () => {
		const claim = {
			id: "clm_1",
			kind: "Claim",
			text: "Some claim",
			status: "invalid_status",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => ClaimSchema.parse(claim)).toThrow();
	});

	it("should reject claim with wrong kind", () => {
		const claim = {
			id: "clm_1",
			kind: "Entity",
			text: "Some claim",
			status: "proposed",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => ClaimSchema.parse(claim)).toThrow();
	});
});

// ── SourceSchema ──

describe("SourceSchema", () => {
	it("should accept a valid source", () => {
		const source = {
			id: "src_1",
			kind: "Source" as const,
			type: "webpage" as const,
			title: "Gemma 4 Technical Report",
			attrs: { uri: "https://example.com/report" },
			createdAt: now,
			updatedAt: now,
		};
		const result = SourceSchema.parse(source);
		expect(result.kind).toBe("Source");
		expect(result.type).toBe("webpage");
	});

	it("should accept all valid source types", () => {
		for (const type of ["webpage", "pdf", "forum", "repo", "dataset", "note", "other"]) {
			const source = {
				id: "src_1",
				kind: "Source" as const,
				type,
				title: "Test Source",
				createdAt: now,
				updatedAt: now,
			};
			expect(SourceSchema.parse(source).type).toBe(type);
		}
	});

	it("should reject source without required type", () => {
		const source = {
			id: "src_1",
			kind: "Source",
			title: "Test Source",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => SourceSchema.parse(source)).toThrow();
	});

	it("should reject source with invalid type", () => {
		const source = {
			id: "src_1",
			kind: "Source",
			type: "invalid",
			title: "Test Source",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => SourceSchema.parse(source)).toThrow();
	});

	it("should reject source without required title", () => {
		const source = {
			id: "src_1",
			kind: "Source",
			type: "webpage",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => SourceSchema.parse(source)).toThrow();
	});
});

// ── EvidenceSchema ──

describe("EvidenceSchema", () => {
	it("should accept valid evidence", () => {
		const evidence = {
			id: "ev_1",
			kind: "Evidence" as const,
			text: "Gemma 4 31B achieves 85.2% on MMLU Pro.",
			attrs: {
				sourceId: "src_1",
				snippet: "Some snippet",
			},
			createdAt: now,
			updatedAt: now,
		};
		const result = EvidenceSchema.parse(evidence);
		expect(result.kind).toBe("Evidence");
		expect(result.attrs.sourceId).toBe("src_1");
	});

	it("should accept evidence with locator", () => {
		const evidence = {
			id: "ev_1",
			kind: "Evidence" as const,
			text: "Evidence text",
			attrs: {
				sourceId: "src_1",
				locator: { type: "text_span", page: 13, section: "Results" },
			},
			createdAt: now,
			updatedAt: now,
		};
		const result = EvidenceSchema.parse(evidence);
		expect(result.attrs.locator).toEqual({ type: "text_span", page: 13, section: "Results" });
	});

	it("should reject evidence without required text", () => {
		const evidence = {
			id: "ev_1",
			kind: "Evidence",
			attrs: { sourceId: "src_1" },
			createdAt: now,
			updatedAt: now,
		};
		expect(() => EvidenceSchema.parse(evidence)).toThrow();
	});

	it("should accept evidence without sourceId in attrs", () => {
		// EvidenceSchema does not require sourceId in attrs; it only requires text
		const evidence = {
			id: "ev_1",
			kind: "Evidence",
			text: "Some text",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = EvidenceSchema.parse(evidence);
		expect(result.kind).toBe("Evidence");
	});
});

// ── QuestionSchema ──

describe("QuestionSchema", () => {
	it("should accept a valid question", () => {
		const question = {
			id: "q_1",
			kind: "Question" as const,
			text: "Are there independent evaluations?",
			status: "open" as const,
			attrs: { priority: 0.8, questionType: "verification" },
			createdAt: now,
			updatedAt: now,
		};
		const result = QuestionSchema.parse(question);
		expect(result.kind).toBe("Question");
		expect(result.status).toBe("open");
	});

	it("should accept all valid question statuses", () => {
		for (const status of ["open", "in_progress", "resolved", "blocked", "obsolete"]) {
			const question = {
				id: "q_1",
				kind: "Question" as const,
				text: "A question",
				status,
				createdAt: now,
				updatedAt: now,
			};
			expect(QuestionSchema.parse(question).status).toBe(status);
		}
	});

	it("should reject question without required text", () => {
		const question = {
			id: "q_1",
			kind: "Question",
			status: "open",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => QuestionSchema.parse(question)).toThrow();
	});

	it("should reject question with invalid status", () => {
		const question = {
			id: "q_1",
			kind: "Question",
			text: "A question",
			status: "invalid",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => QuestionSchema.parse(question)).toThrow();
	});

	it("should reject question with priority out of range", () => {
		const question = {
			id: "q_1",
			kind: "Question",
			text: "A question",
			status: "open",
			attrs: { priority: 1.5 },
			createdAt: now,
			updatedAt: now,
		};
		expect(() => QuestionSchema.parse(question)).toThrow();
	});
});

// ── EdgeSchema ──

describe("EdgeSchema", () => {
	it("should accept a valid edge", () => {
		const edge = {
			id: "e_1",
			type: "related_to",
			fromId: "ent_1",
			toId: "ent_2",
			directed: true,
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = EdgeSchema.parse(edge);
		expect(result.type).toBe("related_to");
	});

	it("should default directed to true", () => {
		const edge = {
			id: "e_1",
			type: "related_to",
			fromId: "ent_1",
			toId: "ent_2",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = EdgeSchema.parse(edge);
		expect(result.directed).toBe(true);
	});

	it("should reject edge with missing required fields", () => {
		expect(() => EdgeSchema.parse({ id: "e_1" })).toThrow();
	});
});

// ── ClaimStatusSchema ──

describe("ClaimStatusSchema", () => {
	it("should accept all valid claim statuses", () => {
		for (const status of [
			"proposed",
			"supported",
			"weakly_supported",
			"contested",
			"contradicted",
			"deprecated",
			"superseded",
		]) {
			expect(ClaimStatusSchema.parse(status)).toBe(status);
		}
	});

	it("should reject invalid claim status", () => {
		expect(() => ClaimStatusSchema.parse("unknown")).toThrow();
	});
});

// ── QuestionStatusSchema ──

describe("QuestionStatusSchema", () => {
	it("should accept all valid question statuses", () => {
		for (const status of ["open", "in_progress", "resolved", "blocked", "obsolete"]) {
			expect(QuestionStatusSchema.parse(status)).toBe(status);
		}
	});

	it("should reject invalid question status", () => {
		expect(() => QuestionStatusSchema.parse("unknown")).toThrow();
	});
});

// ── TaskSchema ──

describe("TaskSchema", () => {
	it("should accept a valid task", () => {
		const task = {
			id: "task_1",
			title: "Research Task",
			goal: "Find evidence",
			status: "active",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = TaskSchema.parse(task);
		expect(result.title).toBe("Research Task");
	});

	it("should default status to active", () => {
		const task = {
			id: "task_1",
			title: "Task",
			goal: "Goal",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = TaskSchema.parse(task);
		expect(result.status).toBe("active");
	});
});

// ── EvidenceLinkSchema ──

describe("EvidenceLinkSchema", () => {
	it("should accept a valid evidence link", () => {
		const link = {
			id: "evl_1",
			evidenceId: "ev_1",
			targetType: "node",
			targetId: "clm_1",
			role: "supports",
			confidence: 0.9,
			createdAt: now,
		};
		const result = EvidenceLinkSchema.parse(link);
		expect(result.role).toBe("supports");
	});
});

// ── OpLogSchema ──

describe("OpLogSchema", () => {
	it("should accept a valid op log", () => {
		const log = {
			id: "op_1",
			opType: "upsertNode",
			actor: "human",
			taskId: "task_1",
			payload: { nodeId: "ent_1" },
			createdAt: now,
		};
		const result = OpLogSchema.parse(log);
		expect(result.actor).toBe("human");
	});

	it("should accept op log without optional taskId", () => {
		const log = {
			id: "op_1",
			opType: "upsertNode",
			actor: "llm",
			payload: {},
			createdAt: now,
		};
		const result = OpLogSchema.parse(log);
		expect(result.taskId).toBeUndefined();
	});
});

// ── BaseNodeSchema ──

describe("BaseNodeSchema", () => {
	it("should accept a minimal valid base node", () => {
		const node = {
			id: "ent_1",
			kind: "Entity",
			createdAt: now,
			updatedAt: now,
		};
		const result = BaseNodeSchema.parse(node);
		expect(result.attrs).toEqual({});
	});

	it("should accept a full valid base node", () => {
		const node = {
			id: "ent_1",
			kind: "Entity",
			type: "Person",
			title: "Test",
			text: "text",
			summary: "summary",
			status: "active",
			confidence: 0.8,
			attrs: { key: "value" },
			createdAt: now,
			updatedAt: now,
		};
		const result = BaseNodeSchema.parse(node);
		expect(result.confidence).toBe(0.8);
	});

	it("should reject node without required id", () => {
		expect(() =>
			BaseNodeSchema.parse({
				kind: "Entity",
				createdAt: now,
				updatedAt: now,
			}),
		).toThrow();
	});

	it("should reject node with invalid confidence", () => {
		expect(() =>
			BaseNodeSchema.parse({
				id: "ent_1",
				kind: "Entity",
				confidence: -0.1,
				createdAt: now,
				updatedAt: now,
			}),
		).toThrow();
	});
});
