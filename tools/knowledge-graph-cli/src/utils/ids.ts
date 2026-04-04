import { randomBytes } from "node:crypto";

const PREFIX_MAP: Record<string, string> = {
	Entity: "ent",
	Claim: "clm",
	Source: "src",
	Evidence: "ev",
	Observation: "obs",
	Question: "q",
	Hypothesis: "hyp",
	Gap: "gap",
	Task: "task",
	Value: "val",
	edge: "e",
	evidenceLink: "evl",
	opLog: "op",
	nodeTaskLink: "ntl",
	taskItem: "tki",
} as const;

function shortId(bytes = 6): string {
	return randomBytes(bytes).toString("hex").slice(0, 8);
}

export function generateId(kind: string): string {
	const prefix = PREFIX_MAP[kind] ?? "id";
	return `${prefix}_${shortId()}_${Date.now().toString(36)}`;
}
