import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
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
		const topicDir = join(tempDir, "test-topic");

		const result = exec(`new-topic "测试主题" --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		expect(existsSync(join(topicDir, "kg.json"))).toBe(true);

		const data = JSON.parse(readFileSync(join(topicDir, "kg.json"), "utf-8"));
		expect(data.nodes).toBeDefined();
	});

	it("should create a task", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const result = exec(
			`task add --title "Research Task" --goal "Investigate claims" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.id).toMatch(/^task_/);
	});

	it("should create an Entity node", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const result = exec(
			`node upsert --kind Entity --type Person --title "OpenAI" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create an Edge", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		// Create two entities first
		const e1 = exec(
			`node upsert --kind Entity --type Person --title "A" --dir "${topicDir}"`,
			tempDir,
		);
		const e2 = exec(
			`node upsert --kind Entity --type Person --title "B" --dir "${topicDir}"`,
			tempDir,
		);
		const id1 = JSON.parse(e1.stdout).id;
		const id2 = JSON.parse(e2.stdout).id;

		const result = exec(
			`edge create --from ${id1} --to ${id2} --type related_to --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should query nodes", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);
		exec(`node upsert --kind Entity --type Person --title "OpenAI" --dir "${topicDir}"`, tempDir);

		const result = exec(`node list --kind Entity --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.length).toBeGreaterThanOrEqual(1);
	});

	it("should query edges", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const e1 = exec(
			`node upsert --kind Entity --type Person --title "A" --dir "${topicDir}"`,
			tempDir,
		);
		const e2 = exec(
			`node upsert --kind Entity --type Person --title "B" --dir "${topicDir}"`,
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
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const result = exec(
			`source add --type webpage --title "Test Source" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create Evidence", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const src = exec(
			`source add --type webpage --title "Test Source" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

		const result = exec(
			`evidence add --text "Evidence text" --source-id ${srcId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should link Evidence to Entity", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const src = exec(
			`source add --type webpage --title "Test Source" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

		const ev = exec(
			`evidence add --text "Evidence text" --source-id ${srcId} --dir "${topicDir}"`,
			tempDir,
		);
		const evId = JSON.parse(ev.stdout).id;

		const ent = exec(
			`node upsert --kind Entity --type Person --title "A" --dir "${topicDir}"`,
			tempDir,
		);
		const entId = JSON.parse(ent.stdout).id;

		const result = exec(
			`evidence link --evidence ${evId} --target ${entId} --role supports --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create a Claim", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const result = exec(
			`claim add --text "Test claim" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should set Claim status", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const claim = exec(
			`claim add --text "Test claim" --dir "${topicDir}"`,
			tempDir,
		);
		const claimId = JSON.parse(claim.stdout).id;

		const result = exec(
			`claim set-status ${claimId} supported --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create a Question", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const result = exec(
			`question add --text "What is the evidence?" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should run graph stats", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);
		exec(`node upsert --kind Entity --type Person --title "A" --dir "${topicDir}"`, tempDir);

		const result = exec(`graph stats --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.totalNodes).toBeGreaterThanOrEqual(1);
	});

	it("should run graph lint", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const result = exec(`graph lint --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
	});

	it("should run llm extract-entities", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const src = exec(
			`source add --type webpage --title "Test Source" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

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
		const topicDir = join(tempDir, "test-topic");
		exec(`new-topic "Test Topic" --dir "${topicDir}"`, tempDir);

		const result = exec(`llm generate-questions --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.taskType).toBe("generate_questions");
	});
});
