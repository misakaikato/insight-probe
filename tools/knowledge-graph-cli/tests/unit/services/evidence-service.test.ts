import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { EvidenceService } from "../../../src/core/services/evidence-service";
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

describe("EvidenceService", () => {
	it("should create a source via addSource", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		// addSource takes { title, uri?, sourceType, attrs? }
		const source = service.addSource({
			sourceType: "webpage",
			title: "Gemma 4 Technical Report",
			uri: "https://example.com/report",
		});
		expect(source.id).toMatch(/^src_/);
		expect(source.kind).toBe("Source");
		expect(source.title).toBe("Gemma 4 Technical Report");
	});

	it("should create evidence via addEvidence", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({
			sourceType: "webpage",
			title: "Test Source",
		});
		// addEvidence takes { sourceId, snippet, quote?, locator?, confidence?, attrs? }
		const evidence = service.addEvidence({
			sourceId: source.id,
			snippet: "Gemma 4 31B achieves 85.2% on MMLU Pro.",
		});
		expect(evidence.id).toMatch(/^ev_/);
		expect(evidence.kind).toBe("Evidence");
		expect(evidence.attrs.sourceId).toBe(source.id);
	});

	it("should link evidence to a target node via linkEvidence", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({ sourceType: "webpage", title: "S1" });
		const evidence = service.addEvidence({
			sourceId: source.id,
			snippet: "Evidence text",
		});

		// Create a target node
		context.graphService.upsertNode({
			kind: "Claim",
			text: "A claim",
			status: "proposed",
			attrs: {},
		});
		// Find the claim that was just created
		const claims = context.graphService.listNodes({ kind: "Claim" });
		const claim = claims[0];

		const link = service.linkEvidence(evidence.id, "node", claim.id, "supports");
		expect(link.evidenceId).toBe(evidence.id);
		expect(link.targetId).toBe(claim.id);
		expect(link.role).toBe("supports");
	});

	it("should list evidence by target via listEvidenceByTarget", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({ sourceType: "webpage", title: "S1" });
		const ev1 = service.addEvidence({ sourceId: source.id, snippet: "Ev1" });
		const ev2 = service.addEvidence({ sourceId: source.id, snippet: "Ev2" });

		context.graphService.upsertNode({
			kind: "Claim",
			text: "A claim",
			status: "proposed",
			attrs: {},
		});
		const claims = context.graphService.listNodes({ kind: "Claim" });
		const claim = claims[0];

		service.linkEvidence(ev1.id, "node", claim.id, "supports");
		service.linkEvidence(ev2.id, "node", claim.id, "contradicts");

		// listEvidenceByTarget returns { evidence, links }, not a flat array
		const result = service.listEvidenceByTarget(claim.id);
		expect(result.evidence).toHaveLength(2);
	});

	it("should list evidence by target and filter by role via links", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({ sourceType: "webpage", title: "S1" });
		const ev1 = service.addEvidence({ sourceId: source.id, snippet: "Ev1" });
		const ev2 = service.addEvidence({ sourceId: source.id, snippet: "Ev2" });

		context.graphService.upsertNode({
			kind: "Claim",
			text: "A claim",
			status: "proposed",
			attrs: {},
		});
		const claims = context.graphService.listNodes({ kind: "Claim" });
		const claim = claims[0];

		service.linkEvidence(ev1.id, "node", claim.id, "supports");
		service.linkEvidence(ev2.id, "node", claim.id, "contradicts");

		// listEvidenceByTarget does not accept a role filter; filter links manually
		const result = service.listEvidenceByTarget(claim.id);
		const supportingLinks = result.links.filter((l) => l.role === "supports");
		expect(supportingLinks).toHaveLength(1);
	});
});
