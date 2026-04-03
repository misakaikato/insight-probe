import type { BaseNode, QuestionStatus } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";

export class QuestionService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	addQuestion(data: {
		text: string;
		questionType?: string;
		priority?: number;
		attrs?: Record<string, unknown>;
	}): BaseNode {
		return this.graphService.upsertNode({
			kind: "Question",
			text: data.text,
			status: "open",
			attrs: {
				questionType: data.questionType,
				priority: data.priority,
				...data.attrs,
			},
		});
	}

	getQuestion(id: string): BaseNode | undefined {
		const node = this.store.getNode(id);
		if (node && node.kind === "Question") return node;
		return undefined;
	}

	listQuestions(filters: { status?: string; taskId?: string }): BaseNode[] {
		return this.graphService.listNodes({
			kind: "Question",
			status: filters.status,
			taskId: filters.taskId,
		});
	}

	setQuestionStatus(id: string, status: QuestionStatus): BaseNode | undefined {
		const question = this.store.getNode(id);
		if (!question) return undefined;
		if (question.kind !== "Question") {
			throw new Error(`节点 ${id} 不是 Question 类型`);
		}
		return this.graphService.upsertNode({
			...question,
			status,
		});
	}
}
