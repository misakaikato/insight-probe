import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { GapService } from "../../../src/core/services/gap-service";
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

describe("GapService", () => {
	it("should detect claims without evidence", () => {
		context = createTestStore();
		const service = new GapService(context.store, context.graphService);
		// Create a claim with no evidence links
		context.graphService.upsertNode({
			kind: "Claim",
			text: "Unevidenced claim",
			status: "proposed",
			attrs: {},
		});

		// detectGaps returns BaseNode[] of Gap nodes
		const gaps = service.detectGaps();
		const noEvidenceGaps = gaps.filter(
			(g) => (g.attrs as Record<string, unknown>).gapType === "no_evidence",
		);
		expect(noEvidenceGaps.length).toBeGreaterThanOrEqual(1);
	});

	it("should detect claims with only single source", () => {
		context = createTestStore();
		const service = new GapService(context.store, context.graphService);
		// Create a claim and a source/evidence with only a single source
		const source = context.graphService.upsertNode({
			kind: "Source",
			title: "Test Source",
			type: "webpage",
			attrs: {},
		});
		const evidence = context.graphService.upsertNode({
			kind: "Evidence",
			text: "Evidence text",
			attrs: { sourceId: source.id },
		});
		const claim = context.graphService.upsertNode({
			kind: "Claim",
			text: "Single-source claim",
			status: "proposed",
			attrs: {},
		});
		context.store.createEvidenceLink({
			id: "evl_1",
			evidenceId: evidence.id,
			targetType: "node",
			targetId: claim.id,
			role: "supports",
			createdAt: new Date().toISOString(),
		});

		// detectGaps returns BaseNode[] of Gap nodes
		const gaps = service.detectGaps();
		const insufficientGaps = gaps.filter(
			(g) => (g.attrs as Record<string, unknown>).gapType === "insufficient_evidence",
		);
		expect(insufficientGaps.length).toBeGreaterThanOrEqual(1);
	});

	it("should detect long-open questions", () => {
		context = createTestStore();
		const service = new GapService(context.store, context.graphService);
		// Create an old open question
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 30);
		context.store.upsertNode({
			id: "q_1",
			kind: "Question",
			text: "Old question",
			status: "open",
			attrs: {},
			createdAt: oldDate.toISOString(),
			updatedAt: oldDate.toISOString(),
		});

		// detectGaps returns BaseNode[] of Gap nodes
		const gaps = service.detectGaps();
		const unresolvedGaps = gaps.filter(
			(g) => (g.attrs as Record<string, unknown>).gapType === "unresolved_question",
		);
		expect(unresolvedGaps.length).toBeGreaterThanOrEqual(1);
	});

	it("should list all detected gaps via listGaps", () => {
		context = createTestStore();
		const service = new GapService(context.store, context.graphService);
		context.graphService.upsertNode({
			kind: "Claim",
			text: "Unevidenced claim",
			status: "proposed",
			attrs: {},
		});

		// First detect gaps to create Gap nodes
		service.detectGaps();

		// listGaps requires a filters argument
		const gaps = service.listGaps({});
		expect(gaps.length).toBeGreaterThanOrEqual(1);
		// Each gap should be a Gap node
		expect(gaps[0].kind).toBe("Gap");
	});
});
