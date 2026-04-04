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
});
