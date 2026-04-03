import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { ClaimService } from "../../../src/core/services/claim-service";
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

describe("ClaimService", () => {
	it("should create a claim via addClaim", () => {
		context = createTestStore();
		const service = new ClaimService(context.store, context.graphService);
		// claimType is a top-level field, not inside attrs
		const claim = service.addClaim({
			text: "Gemma 4 achieves 85% on MMLU Pro",
			claimType: "benchmark_result",
		});
		expect(claim.id).toMatch(/^clm_/);
		expect(claim.kind).toBe("Claim");
		expect(claim.text).toBe("Gemma 4 achieves 85% on MMLU Pro");
		expect(claim.status).toBe("proposed");
	});

	it("should list claims with status filter", () => {
		context = createTestStore();
		const service = new ClaimService(context.store, context.graphService);
		service.addClaim({ text: "Claim 1" });
		const claim2 = service.addClaim({ text: "Claim 2" });
		service.setClaimStatus(claim2.id, "supported");

		const supported = service.listClaims({ status: "supported" });
		expect(supported).toHaveLength(1);
	});

	it("should list claims with no filter", () => {
		context = createTestStore();
		const service = new ClaimService(context.store, context.graphService);
		service.addClaim({ text: "Claim 1" });
		service.addClaim({ text: "Claim 2" });
		// listClaims requires a filters argument
		expect(service.listClaims({})).toHaveLength(2);
	});

	it("should change claim status via setClaimStatus", () => {
		context = createTestStore();
		const service = new ClaimService(context.store, context.graphService);
		const claim = service.addClaim({ text: "Test claim" });
		expect(claim.status).toBe("proposed");

		const updated = service.setClaimStatus(claim.id, "supported");
		expect(updated?.status).toBe("supported");
	});

	it("should throw when setting invalid status", () => {
		context = createTestStore();
		const service = new ClaimService(context.store, context.graphService);
		const claim = service.addClaim({ text: "Test claim" });
		expect(() => service.setClaimStatus(claim.id, "invalid_status" as any)).toThrow();
	});

	it("should get conflicting evidence for a claim via getConflicts", () => {
		context = createTestStore();
		const service = new ClaimService(context.store, context.graphService);
		const claim = service.addClaim({ text: "Test claim" });

		// Create supporting and contradicting evidence links manually
		context.store.createEvidenceLink({
			id: "evl_1",
			evidenceId: "ev_1",
			targetType: "node",
			targetId: claim.id,
			role: "supports",
			createdAt: new Date().toISOString(),
		});
		context.store.createEvidenceLink({
			id: "evl_2",
			evidenceId: "ev_2",
			targetType: "node",
			targetId: claim.id,
			role: "contradicts",
			createdAt: new Date().toISOString(),
		});

		// getConflicts returns { claim, contradicting, supporting }
		const conflicts = service.getConflicts(claim.id);
		expect(conflicts.contradicting.length).toBeGreaterThanOrEqual(1);
		expect(conflicts.supporting.length).toBeGreaterThanOrEqual(1);
		expect(conflicts.claim.id).toBe(claim.id);
	});

	it("should merge two claims via mergeClaims", () => {
		context = createTestStore();
		const service = new ClaimService(context.store, context.graphService);
		const claim1 = service.addClaim({ text: "Claim A", claimType: "fact" });
		const claim2 = service.addClaim({ text: "Claim B", claimType: "fact" });

		// mergeClaims takes (id1, id2) only, no third argument
		const merged = service.mergeClaims(claim1.id, claim2.id);
		expect(merged.id).toBe(claim1.id);
		// Original claim2 should be gone
		expect(context.store.getNode(claim2.id)).toBeUndefined();
	});
});
