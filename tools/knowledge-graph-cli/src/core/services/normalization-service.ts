import type { BaseNode } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";

export class NormalizationService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	findDuplicateEntities(taskId?: string): Array<{ entities: BaseNode[]; reason: string }> {
		const entities = this.graphService.listNodes({ kind: "Entity", taskId });
		const results: Array<{ entities: BaseNode[]; reason: string }> = [];
		const seen = new Set<string>();

		for (let i = 0; i < entities.length; i++) {
			if (seen.has(entities[i].id)) continue;

			const group: BaseNode[] = [entities[i]];
			let reason = "";

			for (let j = i + 1; j < entities.length; j++) {
				if (seen.has(entities[j].id)) continue;

				const e1 = entities[i];
				const e2 = entities[j];

				// Same type and similar name
				if (e1.type === e2.type) {
					const nameSimilarity = this.stringSimilarity(
						(e1.title ?? "").toLowerCase(),
						(e2.title ?? "").toLowerCase(),
					);

					if (nameSimilarity > 0.8) {
						group.push(e2);
						seen.add(e2.id);
						reason = `名称高度相似 (${(nameSimilarity * 100).toFixed(0)}%)，类型相同 (${e1.type})`;
						continue;
					}

					// Check alias overlap
					const aliases1 = (e1.attrs?.aliases as string[] | undefined) ?? [];
					const aliases2 = (e2.attrs?.aliases as string[] | undefined) ?? [];
					const names1 = [e1.title, ...aliases1].filter(Boolean).map((s) => s!.toLowerCase());
					const names2 = [e2.title, ...aliases2].filter(Boolean).map((s) => s!.toLowerCase());
					const hasOverlap = names1.some((n1) =>
						names2.some((n2) => n1 === n2 || this.stringSimilarity(n1, n2) > 0.85),
					);
					if (hasOverlap) {
						group.push(e2);
						seen.add(e2.id);
						reason = `名称或别名存在重叠，类型相同 (${e1.type})`;
					}
				}
			}

			if (group.length > 1) {
				seen.add(entities[i].id);
				results.push({
					entities: group,
					reason: reason || `名称或别名存在重叠`,
				});
			}
		}

		return results;
	}

	findDuplicateClaims(taskId?: string): Array<{ claims: BaseNode[]; reason: string }> {
		const claims = this.graphService.listNodes({ kind: "Claim", taskId });
		const results: Array<{ claims: BaseNode[]; reason: string }> = [];
		const seen = new Set<string>();

		for (let i = 0; i < claims.length; i++) {
			if (seen.has(claims[i].id)) continue;

			const group: BaseNode[] = [claims[i]];
			let reason = "";

			for (let j = i + 1; j < claims.length; j++) {
				if (seen.has(claims[j].id)) continue;

				const text1 = (claims[i].text ?? "").toLowerCase();
				const text2 = (claims[j].text ?? "").toLowerCase();
				const similarity = this.stringSimilarity(text1, text2);

				if (similarity > 0.75) {
					group.push(claims[j]);
					seen.add(claims[j].id);
					reason = `断言文本高度相似 (${(similarity * 100).toFixed(0)}%)`;
				}
			}

			if (group.length > 1) {
				seen.add(claims[i].id);
				results.push({
					claims: group,
					reason: reason || `断言文本高度相似`,
				});
			}
		}

		return results;
	}

	private stringSimilarity(a: string, b: string): number {
		if (a === b) return 1;
		if (a.length === 0 || b.length === 0) return 0;

		// Simple character-level similarity using longest common subsequence ratio
		const lenA = a.length;
		const lenB = b.length;
		const maxLen = Math.max(lenA, lenB);

		// Use a simple approach: count matching characters in order
		let matches = 0;
		let j = 0;
		for (let i = 0; i < lenA && j < lenB; i++) {
			if (a[i] === b[j]) {
				matches++;
				j++;
			} else {
				// Try to find a[i] in remaining b
				const idx = b.indexOf(a[i], j);
				if (idx !== -1 && idx - j < 3) {
					matches++;
					j = idx + 1;
				}
			}
		}

		return (2 * matches) / (lenA + lenB);
	}
}
