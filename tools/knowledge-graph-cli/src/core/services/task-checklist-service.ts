import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GraphStore } from "../../storage/graph-store";
import type { BaseNode, Task, TaskChecklist, TaskChecklistItem } from "../models/types";
import { generateId } from "../../utils/ids";
import { now } from "../../utils/time";

const WORKFLOW_SECTION = "Workflow";
const DYNAMIC_SECTION = "Dynamic Tasks";
const ROUND_PLAN_SECTION_PREFIX = "Round ";

export const WORKFLOW_ITEMS = {
	deriveDirection: "从图谱推导下一步搜索方向，并确认本轮研究目标",
	runSearch: "执行搜索并保存原始搜索结果",
	collectSources: "筛选来源、写入 Source 节点，并补齐页面正文",
	extractKnowledge: "执行实体、断言、关系与观察提取",
	writeGraph: "写入 Evidence / Claim / Edge，并建立证据链",
	qualityGate: "执行质量门控与 graph lint，补齐薄弱信息",
	synthesizeNextRound: "执行规范化、生成问题/假设/缺口，并判断是否进入下一轮",
	updateRecords: "完成本轮后更新 tasks.md 与研究记录",
} as const;

const DEFAULT_WORKFLOW_ITEMS = Object.values(WORKFLOW_ITEMS);

const SECTION_PATTERN = /^##\s+(.+?)\s*$/;
const ITEM_PATTERN =
	/^- \[( |x)\] (.*?)(?:\s*<!--\s*kg-task-item:([A-Za-z0-9_\-]+)\s*-->)?\s*$/;

export class TaskChecklistService {
	constructor(private store: GraphStore) {}

	private isRoundWorkflowItemText(itemText: string, workflowText: string): boolean {
		return itemText.startsWith("[Round ") && itemText.includes(`] ${workflowText}`);
	}

	private buildRoundWorkflowItems(round: number): TaskChecklistItem[] {
		return DEFAULT_WORKFLOW_ITEMS.map((text) => ({
			id: generateId("taskItem"),
			text: `[Round ${round}] ${text}`,
			completed: false,
			section: `${ROUND_PLAN_SECTION_PREFIX}${round}`,
		}));
	}

	private listTaskIdsFromNode(node: BaseNode): string[] {
		const taskIds = new Set<string>(this.store.getNodeTaskIds(node.id));

		const attrTaskId = node.attrs?.taskId;
		if (typeof attrTaskId === "string" && attrTaskId.trim().length > 0) {
			taskIds.add(attrTaskId);
		}

		const attrTaskIds = node.attrs?.taskIds;
		if (Array.isArray(attrTaskIds)) {
			for (const id of attrTaskIds) {
				if (typeof id === "string" && id.trim().length > 0) {
					taskIds.add(id);
				}
			}
		}

		return [...taskIds];
	}

	private getTaskOrThrow(taskId: string): Task {
		const task = this.store.getTask(taskId);
		if (!task) {
			throw new Error(`任务不存在: ${taskId}`);
		}
		return task;
	}

	private getResearchDir(): string {
		return dirname(this.store.path);
	}

	getTaskPaths(taskId: string): { taskDir: string; tasksFile: string } {
		const taskDir = join(this.getResearchDir(), "tasks", taskId);
		return {
			taskDir,
			tasksFile: join(taskDir, "tasks.md"),
		};
	}

	private updateTaskAttrs(task: Task, taskDir: string, tasksFile: string): Task {
		const nextAttrs = {
			...task.attrs,
			taskDir,
			tasksFile,
		};

		const unchanged =
			task.attrs?.taskDir === taskDir &&
			task.attrs?.tasksFile === tasksFile;
		if (unchanged) {
			return task;
		}

		const updated = this.store.updateTask(task.id, {
			attrs: nextAttrs,
		});
		this.store.save();
		return updated ?? task;
	}

	private buildDefaultItems(): TaskChecklistItem[] {
		return DEFAULT_WORKFLOW_ITEMS.map((text) => ({
			id: generateId("taskItem"),
			text,
			completed: false,
			section: WORKFLOW_SECTION,
		}));
	}

	private normalizeSectionOrder(
		items: TaskChecklistItem[],
		extraSections: string[] = [],
	): string[] {
		const seen = new Set<string>();
		const order: string[] = [];

		for (const section of [WORKFLOW_SECTION, DYNAMIC_SECTION]) {
			if (!seen.has(section)) {
				seen.add(section);
				order.push(section);
			}
		}

		for (const item of items) {
			if (!seen.has(item.section)) {
				seen.add(item.section);
				order.push(item.section);
			}
		}

		for (const section of extraSections) {
			if (!seen.has(section)) {
				seen.add(section);
				order.push(section);
			}
		}

		return order;
	}

	private renderChecklistMarkdown(
		task: Task,
		items: TaskChecklistItem[],
		taskDir: string,
		tasksFile: string,
	): string {
		const sectionOrder = this.normalizeSectionOrder(items);
		const lines: string[] = [
			"# Task Checklist",
			"",
			`- Task ID: \`${task.id}\``,
			`- Title: ${task.title}`,
			`- Goal: ${task.goal || "（未设置）"}`,
			`- Status: ${task.status}`,
			`- Task Dir: \`${taskDir}\``,
			`- Tasks File: \`${tasksFile}\``,
			`- Updated: ${now()}`,
			"",
		];

		for (const section of sectionOrder) {
			lines.push(`## ${section}`);
			lines.push("");

			const sectionItems = items.filter((item) => item.section === section);
			if (sectionItems.length === 0) {
				lines.push("_No items yet._");
				lines.push("");
				continue;
			}

			for (const item of sectionItems) {
				lines.push(
					`- [${item.completed ? "x" : " "}] ${item.text} <!-- kg-task-item:${item.id} -->`,
				);
			}
			lines.push("");
		}

		return `${lines.join("\n").trimEnd()}\n`;
	}

	private parseChecklist(markdown: string): TaskChecklistItem[] {
		const lines = markdown.split(/\r?\n/);
		let section = WORKFLOW_SECTION;
		const items: TaskChecklistItem[] = [];

		for (const line of lines) {
			const sectionMatch = line.match(SECTION_PATTERN);
			if (sectionMatch) {
				section = sectionMatch[1].trim();
				continue;
			}

			const itemMatch = line.match(ITEM_PATTERN);
			if (!itemMatch) continue;

			items.push({
				id: itemMatch[3] ?? generateId("taskItem"),
				text: itemMatch[2].trim(),
				completed: itemMatch[1] === "x",
				section,
			});
		}

		return items;
	}

	private writeChecklist(task: Task, items: TaskChecklistItem[]): TaskChecklist {
		const { taskDir, tasksFile } = this.getTaskPaths(task.id);
		mkdirSync(taskDir, { recursive: true });

		const normalizedTask = this.updateTaskAttrs(task, taskDir, tasksFile);
		const markdown = this.renderChecklistMarkdown(
			normalizedTask,
			items,
			taskDir,
			tasksFile,
		);
		writeFileSync(tasksFile, markdown, "utf-8");

		return this.readChecklist(task.id);
	}

	initializeTask(taskId: string): TaskChecklist {
		const task = this.getTaskOrThrow(taskId);
		const { taskDir, tasksFile } = this.getTaskPaths(taskId);
		mkdirSync(taskDir, { recursive: true });
		const normalizedTask = this.updateTaskAttrs(task, taskDir, tasksFile);

		if (!existsSync(tasksFile)) {
			const initialItems = this.buildDefaultItems();
			return this.writeChecklist(normalizedTask, initialItems);
		}

		return this.readChecklist(taskId);
	}

	readChecklist(taskId: string): TaskChecklist {
		const task = this.getTaskOrThrow(taskId);
		const { taskDir, tasksFile } = this.getTaskPaths(taskId);
		mkdirSync(taskDir, { recursive: true });
		this.updateTaskAttrs(task, taskDir, tasksFile);

		if (!existsSync(tasksFile)) {
			return this.initializeTask(taskId);
		}

		const markdown = readFileSync(tasksFile, "utf-8");
		const items = this.parseChecklist(markdown);
		const completedItems = items.filter((item) => item.completed);
		const pendingItems = items.filter((item) => !item.completed);

		return {
			taskId,
			taskDir,
			tasksFile,
			items,
			pendingItems,
			completedItems,
			summary: {
				total: items.length,
				completed: completedItems.length,
				pending: pendingItems.length,
			},
			markdown,
		};
	}

	appendItem(taskId: string, text: string, section: string = DYNAMIC_SECTION): TaskChecklistItem {
		const checklist = this.readChecklist(taskId);
		const task = this.getTaskOrThrow(taskId);
		const nextItem: TaskChecklistItem = {
			id: generateId("taskItem"),
			text,
			completed: false,
			section,
		};
		this.writeChecklist(task, [...checklist.items, nextItem]);
		return nextItem;
	}

	appendUniqueItem(taskId: string, text: string, section: string = DYNAMIC_SECTION): TaskChecklistItem {
		const checklist = this.readChecklist(taskId);
		const existing = checklist.items.find(
			(item) => item.text === text && item.section === section,
		);
		if (existing) {
			return existing;
		}

		return this.appendItem(taskId, text, section);
	}

	setItemCompletion(taskId: string, itemRef: string, completed: boolean): TaskChecklistItem {
		const checklist = this.readChecklist(taskId);
		const task = this.getTaskOrThrow(taskId);

		let updatedItem: TaskChecklistItem | null = null;
		const nextItems = checklist.items.map((item) => {
			if (item.id === itemRef || item.text === itemRef) {
				updatedItem = {
					...item,
					completed,
				};
				return updatedItem;
			}
			return item;
		});

		if (!updatedItem) {
			throw new Error(`未找到任务项: ${itemRef}`);
		}

		this.writeChecklist(task, nextItems);
		return updatedItem;
	}

	private setMatchingItemCompletion(
		taskId: string,
		matcher: (item: TaskChecklistItem) => boolean,
		completed: boolean,
	): TaskChecklistItem | null {
		const checklist = this.readChecklist(taskId);
		const task = this.getTaskOrThrow(taskId);

		const matchedIndex = [...checklist.items]
			.map((item, index) => ({ item, index }))
			.reverse()
			.find(({ item }) => matcher(item))?.index;

		if (matchedIndex === undefined) {
			return null;
		}

		const nextItems = checklist.items.map((item, index) =>
			index === matchedIndex ? { ...item, completed } : item,
		);
		this.writeChecklist(task, nextItems);
		return nextItems[matchedIndex];
	}

	markWorkflowStep(taskId: string, workflowText: string, completed: boolean = true): TaskChecklistItem | null {
		return this.setMatchingItemCompletion(
			taskId,
			(item) => item.text === workflowText,
			completed,
		);
	}

	markWorkflowProgress(taskId: string, workflowText: string, completed: boolean = true): TaskChecklistItem[] {
		const checklist = this.readChecklist(taskId);
		const task = this.getTaskOrThrow(taskId);
		const targetIndexes = new Set<number>();

		const baseIndex = checklist.items.findIndex((item) => item.text === workflowText);
		if (baseIndex !== -1) {
			targetIndexes.add(baseIndex);
		}

		const latestRoundIndex = [...checklist.items]
			.map((item, index) => ({ item, index }))
			.reverse()
			.find(({ item }) => this.isRoundWorkflowItemText(item.text, workflowText))
			?.index;
		if (latestRoundIndex !== undefined) {
			targetIndexes.add(latestRoundIndex);
		}

		if (targetIndexes.size === 0) {
			return [];
		}

		const matchedItems: TaskChecklistItem[] = [];
		const nextItems = checklist.items.map((item, index) => {
			if (!targetIndexes.has(index)) {
				return item;
			}

			const updated = { ...item, completed };
			matchedItems.push(updated);
			return updated;
		});

		this.writeChecklist(task, nextItems);
		return matchedItems;
	}

	getTaskIdsForNode(node: BaseNode): string[] {
		return this.listTaskIdsFromNode(node);
	}

	getTaskIdsForNodeId(nodeId: string): string[] {
		const node = this.store.getNode(nodeId);
		if (!node) return [];
		return this.listTaskIdsFromNode(node);
	}

	getTaskIdsForEdgeNodes(fromId: string, toId: string): string[] {
		const taskIds = new Set<string>();
		for (const id of [...this.getTaskIdsForNodeId(fromId), ...this.getTaskIdsForNodeId(toId)]) {
			taskIds.add(id);
		}
		return [...taskIds];
	}

	getTaskIdsForEvidenceLink(evidenceId: string, targetType: "node" | "edge", targetId: string): string[] {
		const taskIds = new Set<string>(this.getTaskIdsForNodeId(evidenceId));

		if (targetType === "node") {
			for (const id of this.getTaskIdsForNodeId(targetId)) {
				taskIds.add(id);
			}
			return [...taskIds];
		}

		const edge = this.store.getEdge(targetId);
		if (!edge) return [...taskIds];
		for (const id of this.getTaskIdsForEdgeNodes(edge.fromId, edge.toId)) {
			taskIds.add(id);
		}
		return [...taskIds];
	}

	markWorkflowStepForTasks(taskIds: string[], workflowText: string, completed: boolean = true): void {
		for (const taskId of taskIds) {
			this.markWorkflowStep(taskId, workflowText, completed);
		}
	}

	markWorkflowProgressForTasks(taskIds: string[], workflowText: string, completed: boolean = true): void {
		for (const taskId of taskIds) {
			this.markWorkflowProgress(taskId, workflowText, completed);
		}
	}

	syncResearchRoundPlan(input: {
		taskId: string;
		round: number;
		phase: string;
		openQuestions: BaseNode[];
		gaps: BaseNode[];
		hasNextQueries: boolean;
	}): TaskChecklist {
		const { taskId, round, phase, openQuestions, gaps, hasNextQueries } = input;
		const checklist = this.readChecklist(taskId);
		const task = this.getTaskOrThrow(taskId);
		const section = `${ROUND_PLAN_SECTION_PREFIX}${round}`;
		const nextItems = [...checklist.items];

		const existingRoundItems = checklist.items.filter((item) => item.section === section);
		if (existingRoundItems.length === 0) {
			nextItems.push(...this.buildRoundWorkflowItems(round));
		}

		const appendPlan = (text: string) => {
			const exists = nextItems.some(
				(item) => item.section === section && item.text === text,
			);
			if (!exists) {
				nextItems.push({
					id: generateId("taskItem"),
					text,
					completed: false,
					section,
				});
			}
		};

		if (hasNextQueries) {
			appendPlan(`[Round ${round}] 执行 next-search-queries 信封，确认并保存本轮搜索词`);
		}

		if (phase === "search") {
			appendPlan(`[Round ${round}] 优先执行搜索并补充本轮 search_results 产物`);
		}
		if (phase === "extract") {
			appendPlan(`[Round ${round}] 对本轮新增来源执行 extract-entities / extract-claims / extract-relations`);
		}
		if (phase === "gap_detection") {
			appendPlan(`[Round ${round}] 围绕当前 Gap 补充第二来源、反方证据或缺失定义`);
		}
		if (phase === "done") {
			appendPlan(`[Round ${round}] 研究已收敛，生成 final_report.md 并归档任务清单`);
		}

		for (const question of openQuestions.slice(0, 5)) {
			appendPlan(`[Round ${round}] 回答开放问题：${question.text ?? question.title ?? question.id}`);
		}
		for (const gap of gaps.slice(0, 5)) {
			appendPlan(`[Round ${round}] 填补知识缺口：${gap.text ?? gap.title ?? gap.id}`);
		}

		this.writeChecklist(task, nextItems);
		this.markWorkflowProgress(taskId, WORKFLOW_ITEMS.deriveDirection, true);
		return this.readChecklist(taskId);
	}
}
