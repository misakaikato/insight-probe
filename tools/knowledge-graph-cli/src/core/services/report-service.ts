import type { BaseNode, EvidenceLink } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import type { EvidenceService } from "./evidence-service";

export interface Citation {
	sourceId: string;
	number: number;
	title: string;
	uri?: string;
	sourceType: string;
	publishedAt?: string;
}

export interface ClaimCitation {
	claimId: string;
	claimText: string;
	status: string;
	citationNumbers: number[];
	evidenceCount: number;
}

export interface ReportOutput {
	title: string;
	sections: Array<{
		heading: string;
		claims: ClaimCitation[];
	}>;
	citations: Citation[];
	uncitedClaims: ClaimCitation[];
}

export class ReportService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
		private evidenceService: EvidenceService,
	) {}

	/**
	 * Build a source citation map for all claims in the graph.
	 * Returns citations sorted by first appearance order.
	 */
	buildCitationMap(taskId?: string): {
		citations: Citation[];
		claimCitations: ClaimCitation[];
		uncitedClaims: ClaimCitation[];
	} {
		// Get all claims, optionally filtered by task
		const claims = this.graphService.listNodes({
			kind: "Claim",
			taskId,
		});

		// Build source citation map
		const sourceOrder = new Map<string, number>(); // sourceId -> order of first appearance
		const claimCitations: ClaimCitation[] = [];
		const uncitedClaims: ClaimCitation[] = [];

		for (const claim of claims) {
			const supportingLinks = this.store.listEvidenceLinks(
				(l) => l.targetId === claim.id && l.targetType === "node" && l.role === "supports",
			);

			const citationNumbers: number[] = [];
			for (const link of supportingLinks) {
				const evidence = this.store.getNode(link.evidenceId);
				if (!evidence || evidence.kind !== "Evidence") continue;

				const sourceId = evidence.attrs?.sourceId as string | undefined;
				if (!sourceId) continue;

				const source = this.store.getNode(sourceId);
				if (!source || source.kind !== "Source") continue;

				if (!sourceOrder.has(sourceId)) {
					const order = sourceOrder.size + 1;
					sourceOrder.set(sourceId, order);
				}
				citationNumbers.push(sourceOrder.get(sourceId)!);
			}

			// Sort citation numbers
			citationNumbers.sort((a, b) => a - b);

			const claimCitation: ClaimCitation = {
				claimId: claim.id,
				claimText: claim.text ?? claim.title ?? claim.id,
				status: claim.status ?? "unknown",
				citationNumbers,
				evidenceCount: supportingLinks.length,
			};

			if (citationNumbers.length === 0) {
				uncitedClaims.push(claimCitation);
			} else {
				claimCitations.push(claimCitation);
			}
		}

		// Build citations array in order
		const citations: Citation[] = [];
		for (const [sourceId, order] of sourceOrder) {
			const source = this.store.getNode(sourceId);
			if (!source) continue;
			citations.push({
				sourceId,
				number: order,
				title: source.title ?? sourceId,
				uri: source.attrs?.uri as string | undefined,
				sourceType: source.type ?? "unknown",
				publishedAt: source.attrs?.publishedAt as string | undefined,
			});
		}

		return { citations, claimCitations, uncitedClaims };
	}

	/**
	 * Generate markdown report from citation map
	 */
	generateMarkdown(taskId?: string, title?: string): string {
		const { citations, claimCitations, uncitedClaims } = this.buildCitationMap(taskId);
		const reportTitle = title ?? "研究报告";

		const lines: string[] = [];

		// Title
		lines.push(`# ${reportTitle}`);
		lines.push("");

		// Summary stats
		lines.push(`> 共 ${claimCitations.length} 条有引用的断言，${uncitedClaims.length} 条待引证`);
		lines.push("");

		// Main findings with citations
		if (claimCitations.length > 0) {
			lines.push("## 核心发现");
			lines.push("");
			for (const claim of claimCitations) {
				const citeStr = claim.citationNumbers
					.map((n) => `[${n}]`)
					.join("");
				lines.push(`- **${claim.claimText}** ${citeStr}`);
				lines.push(`  - 状态: ${claim.status} | 证据数: ${claim.evidenceCount}`);
				lines.push("");
			}
		}

		// Uncited claims
		if (uncitedClaims.length > 0) {
			lines.push("## 待引证断言");
			lines.push("");
			lines.push("> 以下断言尚无证据支持，建议补充调研");
			lines.push("");
			for (const claim of uncitedClaims) {
				lines.push(`- ${claim.claimText} *[${claim.status}]*`);
			}
			lines.push("");
		}

		// References
		lines.push("## 参考文献");
		lines.push("");
		if (citations.length === 0) {
			lines.push("_（暂无参考文献）_");
		} else {
			for (const cite of citations) {
				let refLine = `[${cite.number}] ${cite.title}`;
				if (cite.uri) {
					refLine += `. ${cite.uri}`;
				}
				if (cite.publishedAt) {
					refLine += `. ${cite.publishedAt}`;
				}
				lines.push(refLine);
			}
		}
		lines.push("");

		// Metadata
		lines.push("---");
		lines.push(`*报告生成时间: ${new Date().toISOString()}*`);

		return lines.join("\n");
	}

	/**
	 * Generate structured JSON report
	 */
	generateReport(taskId?: string, title?: string): ReportOutput {
		const { citations, claimCitations, uncitedClaims } = this.buildCitationMap(taskId);
		return {
			title: title ?? "研究报告",
			sections: [
				{
					heading: "核心发现",
					claims: claimCitations,
				},
				{
					heading: "待引证断言",
					claims: uncitedClaims,
				},
			],
			citations,
			uncitedClaims,
		};
	}
}
