import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(__dirname, "../../src/cli/index.ts");
const RUNNER = process.env.CLI_RUNNER || "bun";

function exec(args: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
	try {
		const stdout = execSync(`${RUNNER} run ${CLI_PATH} ${args}`, {
			cwd,
			encoding: "utf-8",
			timeout: 15000,
		});
		return { stdout, stderr: "", exitCode: 0 };
	} catch (e: any) {
		return {
			stdout: e.stdout || "",
			stderr: e.stderr || "",
			exitCode: e.status ?? 1,
		};
	}
}

let tempDir: string | null = null;

afterEach(() => {
	if (tempDir) {
		rmSync(tempDir, { recursive: true });
		tempDir = null;
	}
});

// Skip all e2e tests if CLI entry point does not exist yet
const cliExists = existsSync(CLI_PATH);
const describeE2E = cliExists ? describe : describe.skip;

describeE2E("CLI E2E", () => {
	it("should create a new topic", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		// new-topic creates a directory under <cwd>/temp/<topic>_<timestamp>
		// It does not take --dir; it takes the topic name as a positional argument
		const result = exec('new-topic "测试主题"', tempDir);
		expect(result.exitCode).toBe(0);

		const output = JSON.parse(result.stdout);
		expect(output.dir).toBeDefined();
		// Verify kg.json exists in the created directory
		expect(existsSync(join(output.dir, "kg.json"))).toBe(true);
		expect(existsSync(output.tasksFile)).toBe(true);

		const data = JSON.parse(readFileSync(join(output.dir, "kg.json"), "utf-8"));
		expect(data.nodes).toBeDefined();
	});

	it("should create a task", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		// Create a topic first
		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// task create (not task add) with --title and --goal
		const result = exec(
			`task create --title "Research Task" --goal "Investigate claims" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.id).toMatch(/^task_/);
		expect(existsSync(output.tasksFile)).toBe(true);
	});

	it("should create an Entity node", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// node upsert reads from stdin via --json-in
		const jsonFilePath = join(tempDir, "node-data.json");
		writeFileSync(jsonFilePath, JSON.stringify({
			kind: "Entity",
			type: "Person",
			title: "OpenAI",
		}));

		const result = exec(
			`node upsert --json-in "${jsonFilePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create an Edge", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// Create two entities first via node upsert with --json-in
		const e1JsonPath = join(tempDir, "e1.json");
		writeFileSync(e1JsonPath, JSON.stringify({ kind: "Entity", type: "Person", title: "A" }));
		const e1 = exec(
			`node upsert --json-in "${e1JsonPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const e2JsonPath = join(tempDir, "e2.json");
		writeFileSync(e2JsonPath, JSON.stringify({ kind: "Entity", type: "Person", title: "B" }));
		const e2 = exec(
			`node upsert --json-in "${e2JsonPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const id1 = JSON.parse(e1.stdout).id;
		const id2 = JSON.parse(e2.stdout).id;

		// edge create uses --from, --to, --type
		const result = exec(
			`edge create --from ${id1} --to ${id2} --type related_to --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should query nodes", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonPath = join(tempDir, "entity.json");
		writeFileSync(jsonPath, JSON.stringify({ kind: "Entity", type: "Person", title: "OpenAI" }));
		exec(`node upsert --json-in "${jsonPath}" --dir "${topicDir}"`, tempDir);

		// node list with --kind filter
		const result = exec(`node list --kind Entity --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.length).toBeGreaterThanOrEqual(1);
	});

	it("should query edges", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const e1JsonPath = join(tempDir, "e1.json");
		writeFileSync(e1JsonPath, JSON.stringify({ kind: "Entity", type: "Person", title: "A" }));
		const e1 = exec(
			`node upsert --json-in "${e1JsonPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const e2JsonPath = join(tempDir, "e2.json");
		writeFileSync(e2JsonPath, JSON.stringify({ kind: "Entity", type: "Person", title: "B" }));
		const e2 = exec(
			`node upsert --json-in "${e2JsonPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const id1 = JSON.parse(e1.stdout).id;
		const id2 = JSON.parse(e2.stdout).id;
		exec(`edge create --from ${id1} --to ${id2} --type related_to --dir "${topicDir}"`, tempDir);

		const result = exec(`edge list --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.length).toBeGreaterThanOrEqual(1);
	});

	it("should create a Source", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// source add reads from stdin via --json-in
		const jsonPath = join(tempDir, "source.json");
		writeFileSync(jsonPath, JSON.stringify({
			title: "Test Source",
			sourceType: "webpage",
		}));

		const result = exec(
			`source add --json-in "${jsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create Evidence", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// Create source first
		const srcJsonPath = join(tempDir, "source.json");
		writeFileSync(srcJsonPath, JSON.stringify({ title: "Test Source", sourceType: "webpage" }));
		const src = exec(
			`source add --json-in "${srcJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

		// evidence add reads from stdin via --json-in
		const evJsonPath = join(tempDir, "evidence.json");
		writeFileSync(evJsonPath, JSON.stringify({
			sourceId: srcId,
			snippet: "Evidence text",
		}));

		const result = exec(
			`evidence add --json-in "${evJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should link Evidence to Entity", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// Create source
		const srcJsonPath = join(tempDir, "source.json");
		writeFileSync(srcJsonPath, JSON.stringify({ title: "Test Source", sourceType: "webpage" }));
		const src = exec(
			`source add --json-in "${srcJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

		// Create evidence
		const evJsonPath = join(tempDir, "evidence.json");
		writeFileSync(evJsonPath, JSON.stringify({ sourceId: srcId, snippet: "Evidence text" }));
		const ev = exec(
			`evidence add --json-in "${evJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const evId = JSON.parse(ev.stdout).id;

		// Create entity
		const entJsonPath = join(tempDir, "entity.json");
		writeFileSync(entJsonPath, JSON.stringify({ kind: "Entity", type: "Person", title: "A" }));
		const ent = exec(
			`node upsert --json-in "${entJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const entId = JSON.parse(ent.stdout).id;

		// evidence link uses --evidence, --target, --role
		const result = exec(
			`evidence link --evidence ${evId} --target ${entId} --role supports --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create a Claim", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// claim add reads from stdin via --json-in
		const jsonPath = join(tempDir, "claim.json");
		writeFileSync(jsonPath, JSON.stringify({ text: "Test claim" }));

		const result = exec(
			`claim add --json-in "${jsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should set Claim status", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// Create claim
		const jsonPath = join(tempDir, "claim.json");
		writeFileSync(jsonPath, JSON.stringify({ text: "Test claim" }));
		const claim = exec(
			`claim add --json-in "${jsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const claimId = JSON.parse(claim.stdout).id;

		// claim set-status takes <id> <status> as positional args
		const result = exec(
			`claim set-status ${claimId} supported --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create a Question", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// question add reads from stdin via --json-in
		const jsonPath = join(tempDir, "question.json");
		writeFileSync(jsonPath, JSON.stringify({ text: "What is the evidence?" }));

		const result = exec(
			`question add --json-in "${jsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should run graph stats", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonPath = join(tempDir, "entity.json");
		writeFileSync(jsonPath, JSON.stringify({ kind: "Entity", type: "Person", title: "A" }));
		exec(`node upsert --json-in "${jsonPath}" --dir "${topicDir}"`, tempDir);

		const result = exec(`graph stats --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.totalNodes).toBeGreaterThanOrEqual(1);
	});

	it("should run graph lint", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const result = exec(`graph lint --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
	});

	it("should run llm extract-entities", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		// Create a source first
		const srcJsonPath = join(tempDir, "source.json");
		writeFileSync(srcJsonPath, JSON.stringify({ title: "Test Source", sourceType: "webpage" }));
		const src = exec(
			`source add --json-in "${srcJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

		// llm extract-entities uses --source
		const result = exec(
			`llm extract-entities --source ${srcId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.taskType).toBe("extract_entities");
		expect(output.instructions).toBeDefined();
		expect(output.recommendedPrompt).toBeDefined();
		expect(output.outputSchema).toBeDefined();
	});

	it("should run llm generate-questions", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const result = exec(`llm generate-questions --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.taskType).toBe("generate_questions");
	});

	it("should link a created claim to a task and allow task-scoped listing", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Task Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;

		const claimPath = join(tempDir, "task-claim.json");
		writeFileSync(
			claimPath,
			JSON.stringify({
				text: "This claim is intentionally long enough to be easy to identify and should remain visible when filtering by the linked task identifier.",
			}),
		);

		const createResult = exec(
			`claim add --task ${taskId} --json-in "${claimPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(createResult.exitCode).toBe(0);

		const listResult = exec(
			`claim list --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(listResult.exitCode).toBe(0);
		const output = JSON.parse(listResult.stdout);
		expect(output).toHaveLength(1);
		expect(output[0].text).toContain("linked task identifier");
	});

	it("should update source content and expose it to llm extraction tasks", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Source Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;

		const sourcePath = join(tempDir, "source.json");
		writeFileSync(
			sourcePath,
			JSON.stringify({
				title: "Deep Source",
				sourceType: "webpage",
			}),
		);
		const sourceResult = exec(
			`source add --task ${taskId} --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(sourceResult.exitCode).toBe(0);
		const sourceId = JSON.parse(sourceResult.stdout).id;

		const updatePath = join(tempDir, "source-update.json");
		writeFileSync(
			updatePath,
			JSON.stringify({
				text: "This is the captured body text that should appear in the extraction task input context.",
				summary: "Captured summary",
			}),
		);
		const updateResult = exec(
			`source update ${sourceId} --json-in "${updatePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(updateResult.exitCode).toBe(0);

		const extractResult = exec(
			`llm extract-claims --source ${sourceId} --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(extractResult.exitCode).toBe(0);
		const output = JSON.parse(extractResult.stdout);
		expect(output.inputContext.sourceContent).toContain("captured body text");
	});

	it("should reject invalid source types at runtime", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Validation Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const sourcePath = join(tempDir, "bad-source.json");
		writeFileSync(
			sourcePath,
			JSON.stringify({
				title: "Bad Source",
				sourceType: "totally_invalid",
			}),
		);

		const result = exec(
			`source add --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("Invalid Source node");
	});

	it("should reject invalid evidence link roles at runtime", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Evidence Validation"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const sourcePath = join(tempDir, "source.json");
		writeFileSync(sourcePath, JSON.stringify({ title: "Test Source", sourceType: "webpage" }));
		const sourceResult = exec(
			`source add --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		const sourceId = JSON.parse(sourceResult.stdout).id;

		const evidencePath = join(tempDir, "evidence.json");
		writeFileSync(
			evidencePath,
			JSON.stringify({
				sourceId,
				snippet: "This evidence text is long enough to be accepted before link-role validation is applied.",
			}),
		);
		const evidenceResult = exec(
			`evidence add --json-in "${evidencePath}" --dir "${topicDir}"`,
			tempDir,
		);
		const evidenceId = JSON.parse(evidenceResult.stdout).id;

		const claimPath = join(tempDir, "claim.json");
		writeFileSync(
			claimPath,
			JSON.stringify({
				text: "This claim text is long enough to support the invalid link role runtime validation scenario in the CLI.",
			}),
		);
		const claimResult = exec(
			`claim add --json-in "${claimPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const claimId = JSON.parse(claimResult.stdout).id;

		const result = exec(
			`evidence link --evidence ${evidenceId} --target ${claimId} --role nonsense --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("Invalid evidence link");
	});

	it("should keep llm report generation scoped to the requested task", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Report Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskA = topic.taskId;

		const claimAPath = join(tempDir, "claim-a.json");
		writeFileSync(
			claimAPath,
			JSON.stringify({
				text: "Claim from task A that should remain in the task-scoped report envelope after filtering is applied.",
			}),
		);
		exec(
			`claim add --task ${taskA} --json-in "${claimAPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const taskBResult = exec(
			`task create --title "Task B" --goal "Secondary investigation" --dir "${topicDir}"`,
			tempDir,
		);
		const taskB = JSON.parse(taskBResult.stdout).id;

		const claimBPath = join(tempDir, "claim-b.json");
		writeFileSync(
			claimBPath,
			JSON.stringify({
				text: "Claim from task B that should be excluded when generating a report for task A.",
			}),
		);
		exec(
			`claim add --task ${taskB} --json-in "${claimBPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const result = exec(
			`llm generate-report --task ${taskA} --topic "Scoped Report" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.inputContext.claimsCount).toBe(1);
		expect(output.graphContext.focusNodeIds).toHaveLength(1);
	});

	it("should manage task checklist items in tasks.md", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Checklist Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;
		expect(existsSync(topic.tasksFile)).toBe(true);

		const checklistResult = exec(
			`task checklist ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(checklistResult.exitCode).toBe(0);
		const checklist = JSON.parse(checklistResult.stdout);
		expect(checklist.summary.total).toBeGreaterThan(0);

		const addResult = exec(
			`task add-item ${taskId} --text "补充独立第三方来源验证" --dir "${topicDir}"`,
			tempDir,
		);
		expect(addResult.exitCode).toBe(0);
		const item = JSON.parse(addResult.stdout);
		expect(item.id).toMatch(/^tki_/);

		const checkResult = exec(
			`task check ${taskId} --item ${item.id} --dir "${topicDir}"`,
			tempDir,
		);
		expect(checkResult.exitCode).toBe(0);
		const checked = JSON.parse(checkResult.stdout);
		expect(checked.completed).toBe(true);

		const uncheckResult = exec(
			`task uncheck ${taskId} --item ${item.id} --dir "${topicDir}"`,
			tempDir,
		);
		expect(uncheckResult.exitCode).toBe(0);
		const unchecked = JSON.parse(uncheckResult.stdout);
		expect(unchecked.completed).toBe(false);
	});

	it("should append round plans to tasks.md when continuing research", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Research Continue Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;
		const tasksFile = topic.tasksFile;

		const firstResult = exec(
			`research continue --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(firstResult.exitCode).toBe(0);
		const firstOutput = JSON.parse(firstResult.stdout);
		expect(firstOutput.round).toBe(1);
		expect(firstOutput.workflowChecklist.pendingItems.length).toBeGreaterThan(0);

		const firstMarkdown = readFileSync(tasksFile, "utf-8");
		expect(firstMarkdown).toContain("## Round 1");
		expect(firstMarkdown).toContain(
			"[x] [Round 1] 从图谱推导下一步搜索方向，并确认本轮研究目标",
		);

		const secondResult = exec(
			`research continue --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(secondResult.exitCode).toBe(0);
		const secondOutput = JSON.parse(secondResult.stdout);
		expect(secondOutput.round).toBe(2);

		const secondMarkdown = readFileSync(tasksFile, "utf-8");
		expect(secondMarkdown).toContain("## Round 2");
		expect(secondMarkdown.match(/^## Round /gm)?.length).toBe(2);
	});

	it("should auto-mark workflow progress for task-scoped graph actions", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Auto Workflow Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;

		const continueResult = exec(
			`research continue --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(continueResult.exitCode).toBe(0);

		const sourcePath = join(tempDir, "auto-source.json");
		writeFileSync(
			sourcePath,
			JSON.stringify({
				title: "Auto Workflow Source",
				sourceType: "webpage",
				text: "Captured page content that should complete the source collection step for the active task.",
			}),
		);
		const sourceResult = exec(
			`source add --task ${taskId} --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(sourceResult.exitCode).toBe(0);

		const claimPath = join(tempDir, "auto-claim.json");
		writeFileSync(
			claimPath,
			JSON.stringify({
				text: "This task-scoped claim is long enough to count as extracted knowledge and should advance both extraction and graph writing workflow items.",
			}),
		);
		const claimResult = exec(
			`claim add --task ${taskId} --json-in "${claimPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(claimResult.exitCode).toBe(0);

		const questionPath = join(tempDir, "auto-question.json");
		writeFileSync(
			questionPath,
			JSON.stringify({
				text: "What contradictory evidence still needs to be collected for this task?",
			}),
		);
		const questionResult = exec(
			`question add --task ${taskId} --json-in "${questionPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(questionResult.exitCode).toBe(0);

		const lintResult = exec(
			`graph lint --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(lintResult.exitCode).toBe(0);

		const gapResult = exec(
			`gap detect --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(gapResult.exitCode).toBe(0);

		const checklistResult = exec(
			`task checklist ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(checklistResult.exitCode).toBe(0);
		const checklist = JSON.parse(checklistResult.stdout);
		const completedTexts = checklist.completedItems.map((item: { text: string }) => item.text);

		expect(completedTexts).toContain("筛选来源、写入 Source 节点，并补齐页面正文");
		expect(completedTexts).toContain("[Round 1] 筛选来源、写入 Source 节点，并补齐页面正文");
		expect(completedTexts).toContain("执行实体、断言、关系与观察提取");
		expect(completedTexts).toContain("[Round 1] 执行实体、断言、关系与观察提取");
		expect(completedTexts).toContain("写入 Evidence / Claim / Edge，并建立证据链");
		expect(completedTexts).toContain("[Round 1] 写入 Evidence / Claim / Edge，并建立证据链");
		expect(completedTexts).toContain("执行质量门控与 graph lint，补齐薄弱信息");
		expect(completedTexts).toContain("[Round 1] 执行质量门控与 graph lint，补齐薄弱信息");
		expect(completedTexts).toContain("执行规范化、生成问题/假设/缺口，并判断是否进入下一轮");
		expect(completedTexts).toContain("[Round 1] 执行规范化、生成问题/假设/缺口，并判断是否进入下一轮");
	});

	it("should include workflow checklist context in task-scoped llm envelopes", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Workflow Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;

		const sourcePath = join(tempDir, "workflow-source.json");
		writeFileSync(
			sourcePath,
			JSON.stringify({
				title: "Workflow Source",
				sourceType: "webpage",
				text: "This source is used to verify that workflow checklist context is injected into llm task envelopes.",
			}),
		);

		const sourceResult = exec(
			`source add --task ${taskId} --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(sourceResult.exitCode).toBe(0);
		const sourceId = JSON.parse(sourceResult.stdout).id;

		const result = exec(
			`llm extract-claims --source ${sourceId} --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.inputContext.workflowChecklist).toBeDefined();
		expect(output.recommendedPrompt).toContain("外置流程记忆");
	});
});
