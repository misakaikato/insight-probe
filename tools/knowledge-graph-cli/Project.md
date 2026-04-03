下面我直接给你一版**可以交给 coding agent 开始做**的方案。目标不是学术上最完美，而是：

* 适合“搜索 → 提取 → 规范化 → 建图 → 发现缺口 → 再搜索”的闭环
* 适合 **LLM 作为调用方**
* CLI 本身既能做图谱操作，也能**产出给 LLM 的上下文 + prompt**
* 后续可以落到 TypeScript / Node.js / Bun 上实现

---

# 0. 先定原则

你这个系统里，**不要把知识图谱理解成“实体关系数据库”**。
它更像一个**研究状态机**，图只是它的存储和组织形式。

所以要同时表达 4 类东西：

1. **对象**：人、公司、产品、概念、事件、论文……
2. **断言**：某件事成立、不成立、存疑
3. **证据**：断言来自哪段原文，出处是什么
4. **研究过程**：哪些问题已解决，哪些问题待验证，下一步该搜什么

如果没有第 2、3、4 类，你做出来的就不是调研图谱，而只是“信息摘抄图”。

---

# 1. 节点类型设计：有哪些类型，各自做什么

我建议节点类型不要过多，但必须覆盖研究闭环。
核心分成两层：

* **知识层节点**
* **研究层节点**

---

## 1.1 知识层节点

## A. `Entity`

表示客观对象或抽象对象。

### 用途

承载“世界里的东西”，是关系网络的主体。

### 典型子类

* `Person`
* `Organization`
* `Product`
* `Project`
* `Technology`
* `Concept`
* `Method`
* `Dataset`
* `Benchmark`
* `Paper`
* `Event`
* `Location`
* `Tool`
* `Metric`

### 例子

* OpenAI
* Gemma 4 31B
* MMLU Pro
* RAG
* LlamaIndex
* LanceDB

### 典型字段

```json
{
  "id": "ent_openai",
  "kind": "Entity",
  "type": "Organization",
  "name": "OpenAI",
  "aliases": ["OpenAI Inc."],
  "summary": "AI research and product organization",
  "attributes": {
    "founded_year": 2015
  },
  "confidence": 0.98,
  "created_at": "2026-04-03T10:00:00Z",
  "updated_at": "2026-04-03T10:00:00Z"
}
```

---

## B. `Claim`

表示一个可被支持、可被反驳、可过时、可冲突的断言。

### 用途

这是整个系统的核心节点之一。
**调研不是围绕实体转，而是围绕 claim 转。**

### 为什么必须有

因为很多信息不是“永久事实”，而是：

* 有来源
* 有时间
* 有前提
* 有争议
* 可能会变

### 例子

* “Gemma 4 31B 在 MMLU Pro 上达到 85.2%”
* “某项目依赖私有数据源”
* “某理论在沪深市场长期有效”

### 字段

```json
{
  "id": "clm_gemma_mmlu_001",
  "kind": "Claim",
  "text": "Gemma 4 31B achieves 85.2% on MMLU Pro",
  "claim_type": "benchmark_result",
  "status": "supported",
  "confidence": 0.72,
  "valid_time": {
    "start": "2026-03-01T00:00:00Z",
    "end": null
  },
  "scope": {
    "task_id": "task_model_eval"
  },
  "created_at": "2026-04-03T10:00:00Z",
  "updated_at": "2026-04-03T10:00:00Z"
}
```

### 建议状态

* `proposed`
* `supported`
* `weakly_supported`
* `contested`
* `contradicted`
* `deprecated`
* `superseded`

---

## C. `Source`

表示原始来源对象。

### 用途

记录证据来自哪儿。是网页、PDF、论坛贴、数据库记录、访谈笔记等的载体。

### 例子

* 一篇网页
* 一份 PDF
* 一个 github readme
* 一个论坛帖子
* 一份 CSV 数据集

### 字段

```json
{
  "id": "src_001",
  "kind": "Source",
  "source_type": "webpage",
  "title": "Gemma 4 Technical Report",
  "uri": "https://example.com/gemma4-report",
  "published_at": "2026-03-20T00:00:00Z",
  "retrieved_at": "2026-04-03T09:00:00Z",
  "author": "Google",
  "metadata": {
    "language": "en"
  }
}
```

---

## D. `Evidence`

表示从 Source 中切出来的、可引用的证据片段。

### 用途

把“原始来源”里的**具体片段**结构化。
Source 是整篇文章，Evidence 是文章里的某一段、某一个表格行、某一页某一段。

### 例子

* 网页某一段原文
* PDF 第 13 页的一段
* 表格里某个单元格范围
* 访谈记录中一句原话

### 字段

```json
{
  "id": "ev_001",
  "kind": "Evidence",
  "source_id": "src_001",
  "snippet": "Gemma 4 31B achieves 85.2% on MMLU Pro.",
  "locator": {
    "type": "text_span",
    "start": 1234,
    "end": 1288,
    "page": null,
    "section": "Benchmark Results"
  },
  "quote": "Gemma 4 31B achieves 85.2% on MMLU Pro.",
  "extractor": {
    "name": "gpt-5.4-thinking",
    "prompt_version": "extract_v1"
  },
  "confidence": 0.93,
  "created_at": "2026-04-03T10:01:00Z"
}
```

---

## E. `Observation`

表示从原文中抽出的“候选事实”或“中间解释结果”。

### 用途

这是一个很实用的中间层。
不是所有 LLM 抽出的东西都应该直接上升为 Claim。

比如：

* 某段话提到了一个实体
* 某段话疑似暗示某个关系
* 某表格看起来像 benchmark 结果

这些可以先存成 Observation，再由后续规范化流程变成 Entity/Claim/Relation。

### 例子

* “该段提到了 Gemma 4 31B 和 MMLU Pro”
* “这段可能表达的是 benchmark_result”
* “这里可能包含一个数据点 85.2%”

### 字段

```json
{
  "id": "obs_001",
  "kind": "Observation",
  "text": "Possible benchmark result mention: Gemma 4 31B -> MMLU Pro -> 85.2%",
  "status": "unresolved",
  "derived_from_evidence": ["ev_001"],
  "confidence": 0.66
}
```

这个节点不是必须，但我建议保留。它能显著降低 LLM 乱写正式事实的风险。

---

# 1.2 研究层节点

## F. `Question`

表示待回答的问题。

### 用途

驱动下一轮搜索和验证。
这是“迭代深入搜索”真正的发动机。

### 例子

* “Gemma 4 31B 的外部独立评测是否与官方一致？”
* “这个项目是否依赖私有训练数据？”
* “该理论是否在中国市场被复现？”

### 字段

```json
{
  "id": "q_001",
  "kind": "Question",
  "text": "Are there independent third-party evaluations of Gemma 4 31B on MMLU Pro?",
  "status": "open",
  "priority": 0.82,
  "question_type": "verification",
  "created_at": "2026-04-03T10:02:00Z"
}
```

### 状态建议

* `open`
* `in_progress`
* `resolved`
* `blocked`
* `obsolete`

---

## G. `Hypothesis`

表示待验证的推测。

### 用途

在研究过程中，LLM 经常需要先形成一个假设，再搜证据。

### 例子

* “该产品可能主要依赖检索增强而非训练增强”
* “该理论在高波动市场中更容易失效”

### 字段

```json
{
  "id": "hyp_001",
  "kind": "Hypothesis",
  "text": "Independent evaluations may report lower scores than official benchmarks.",
  "status": "proposed",
  "confidence": 0.41
}
```

---

## H. `Gap`

表示知识缺口。

### 用途

它和 Question 很像，但更偏“系统发现的结构性缺口”。

### 例子

* 关键 claim 只有单一来源支持
* 某核心实体缺少定义
* 某主题没有反方证据
* 某时间段没有数据

### 字段

```json
{
  "id": "gap_001",
  "kind": "Gap",
  "gap_type": "insufficient_evidence",
  "description": "Claim clm_gemma_mmlu_001 is supported only by official source.",
  "severity": 0.88,
  "status": "open"
}
```

---

## I. `Task`

表示一次研究任务。

### 用途

把所有节点和边挂到具体调研任务上，便于隔离和回溯。

### 例子

* “Gemma 4 模型评测真实性调研”
* “某项目竞品调研”
* “某理论实证可行性研究”

### 字段

```json
{
  "id": "task_model_eval",
  "kind": "Task",
  "title": "Gemma 4 evaluation research",
  "goal": "Assess whether official benchmark claims are supported by independent evidence.",
  "status": "active"
}
```

---

# 2. 边如何和证据联系起来？证据和边、节点是什么关系？

这是最关键的问题之一。

结论先说：

> **证据不应该只挂在节点上，也不应该只挂在边上。**
> 证据应该首先支持/反驳的是 `Claim`，其次也可以支持“节点属性”和“边”。

所以推荐采用**双层模型**：

1. **图的语义主体是 Claim**
2. **边既可以直接表达关系，也可以通过 Claim 做重述化（reification）**

---

## 2.1 为什么不要只让边挂证据

如果你只有：

* `(Gemma 4 31B) -[achieves]-> (85.2% on MMLU Pro)`

然后把证据挂在这条边上，看起来简洁，但很快就会出问题：

* 边难表达时间范围
* 难表达“被支持/被反驳/已过时”
* 难表达多个来源互相冲突
* 难表达“这个关系是在某条件下成立”
* 难表达该断言是官方宣称还是第三方复现

所以更稳的方式是：

* 边用于基础结构导航
* Claim 用于承载可争议语义
* Evidence 主要挂在 Claim 上

---

## 2.2 推荐关系模型：基础边 + 断言边

---

### 模式 A：基础导航边

用于快速探索图谱，不承载严格证据语义。

例如：

* `mentioned_in`
* `related_to`
* `same_as`
* `has_alias`
* `belongs_to_topic`

这类边可以弱证据或不挂证据，只作为导航结构。

---

### 模式 B：断言型边通过 Claim 节点表达

例如本来你想表达：

* `(Gemma 4 31B) -[achieves_on]-> (MMLU Pro: 85.2%)`

更推荐拆成：

* `Entity(Gemma 4 31B)`
* `Entity(MMLU Pro)`
* `Claim("Gemma 4 31B achieves 85.2% on MMLU Pro")`

然后关系是：

* `Claim -[about_subject]-> Entity(Gemma 4 31B)`
* `Claim -[about_metric]-> Entity(MMLU Pro)`
* `Claim -[has_value]-> ValueNode(85.2%)`
* `Evidence -[supports]-> Claim`
* `Source -[contains]-> Evidence`

这样你就能自然表达：

* 多条 Evidence 支持同一 Claim
* 另一些 Evidence 反驳同一 Claim
* Claim 的状态从 proposed → supported → contested
* Claim 的时间有效性
* Claim 的来源可靠性

---

## 2.3 “证据”和节点、边的关系

我建议定成下面这套：

---

### Source 和 Evidence

* `Source -[contains]-> Evidence`

说明某证据片段来自某来源。

---

### Evidence 和 Claim

* `Evidence -[supports]-> Claim`
* `Evidence -[contradicts]-> Claim`
* `Evidence -[mentions]-> Entity`

`mentions` 很重要，因为它能辅助做实体抽取和消歧。

---

### Claim 和 Entity

* `Claim -[about_subject]-> Entity`
* `Claim -[about_object]-> Entity`
* `Claim -[about_predicate]-> PredicateCatalogItem`（可选）
* `Claim -[answers]-> Question`
* `Claim -[derived_from]-> Observation`

---

### Question 和其他节点

* `Question -[about]-> Entity`
* `Question -[motivated_by]-> Gap`
* `Question -[spawned_from]-> Claim`
* `Question -[investigates]-> Claim`

---

## 2.4 节点属性如何有证据

有些时候，不是边，而是实体属性需要证据。
比如：

* OpenAI founded_year = 2015
* 某模型 active_params = 31B

这时不要只把属性塞在 JSON 里就算完。
建议支持一种 `AttributeClaim` 或普通 Claim 的子类。

例如：

* `Claim("OpenAI founded_year is 2015")`
* `Claim("Gemma 4 31B active parameters are 31B")`

否则后面这些属性就没法被验证、冲突、更新。

---

## 2.5 最稳妥的判断规则

### 适合直接做边的

* 身份映射、导航、组织层级、轻量主题连接
* 不太需要争议管理的关系

如：

* same_as
* alias_of
* member_of_topic
* part_of_taxonomy

### 适合做 Claim 的

* 任何需要来源、时间、状态、争议、数值、限定条件的关系或属性

如：

* benchmark result
* 因果关系
* 归因关系
* 时间性职位
* 市场结论
* 方法效果
* 商业模式推断

---

# 3. 原始内容抽取、规范化、提出新问题，都希望 CLI 输出“结合已有信息 + 给 LLM 的 prompt”

这个思路是对的，而且非常关键。

不要让 CLI 只做“执行器”，它还应该做：

> **面向 LLM 的上下文编排器**

也就是说，CLI 每个研究动作都应该支持两种模式：

1. **执行模式**
2. **提案模式**

---

## 3.1 双模式设计

### A. Execute 模式

直接执行操作，写入图谱。

例如：

```bash
kg extract claims --source src_001 --execute
```

### B. Plan/Prompt 模式

不执行，只输出：

* 当前任务上下文
* 已知相关实体/claim/evidence
* 该做什么的指令
* 推荐 prompt
* 推荐输出 schema

例如：

```bash
kg extract claims --source src_001 --emit-llm-task
```

返回：

```json
{
  "task_type": "extract_claims",
  "context": {
    "source": {...},
    "related_entities": [...],
    "existing_claims": [...]
  },
  "instructions": "Extract candidate claims from the source...",
  "recommended_prompt": "...",
  "output_schema": {...}
}
```

这会让你的系统非常稳，因为：

* CLI 负责拼上下文
* LLM 负责理解和生成
* 上层 agent 再决定是否执行

---

# 4. CLI 应该提供哪些“研究型指令”

我按研究流程给你设计一套。

---

## 4.1 抽取阶段

---

### `kg llm extract-entities`

从 source/evidence 中抽实体候选。

#### 输入

* source_id 或 evidence_id
* topic/task_id
* 限定类型
* 已知实体上下文

#### 输出

* LLM prompt 模板
* 相关上下文
* 输出 schema
* 可选直接执行

#### 返回例子

```json
{
  "task_type": "extract_entities",
  "context": {
    "source_id": "src_001",
    "task_id": "task_model_eval",
    "known_entities": [
      {"id": "ent_gemma4", "name": "Gemma 4"}
    ]
  },
  "instructions": "Extract candidate entities mentioned in the source...",
  "recommended_prompt": "You are given a source and existing graph context...",
  "output_schema": {
    "type": "object",
    "properties": {
      "entities": {
        "type": "array"
      }
    }
  }
}
```

---

### `kg llm extract-observations`

从原始内容中先提 Observation，而不是一步到位写 Claim。

适合早期高噪声场景。

---

### `kg llm extract-claims`

从 source/evidence 中提可验证断言。

应结合：

* 已知实体
* 现有 claim
* 当前 question
* 当前 gap

这样 LLM 才不会瞎抽。

---

### `kg llm extract-relations`

从 source/evidence 中提关系候选。

注意建议输出的是：

* 候选关系
* 是否建议上升为 Claim
* 置信度
* 所需证据片段

而不是直接写边。

---

## 4.2 规范化阶段

---

### `kg llm normalize-entities`

用途：

* 实体去重
* alias 合并
* 类型修正
* canonical name 统一

输出给 LLM：

* 候选实体列表
* 相似度线索
* 已知 alias
* 冲突属性
* 合并策略 prompt

---

### `kg llm normalize-claims`

用途：

* 相似 claim 合并
* 重复 claim 去重
* claim 类型校正
* claim 状态修正

---

### `kg llm normalize-predicates`

用途：

* 把 LLM 抽出的自由文本关系词映射到受控谓词表

比如：

* built_by
* created_by
* developed_by

是否统一到：

* `developed_by`

---

## 4.3 研究推进阶段

---

### `kg llm generate-questions`

输入：

* 某个 task/topic/subgraph
* 当前 unresolved claims
* 当前 evidence coverage
* 当前 conflict clusters

输出：

* 候选问题列表
* 每个问题的优先级
* 每个问题建议的搜索方向

这是非常核心的命令。

---

### `kg llm generate-hypotheses`

输入：

* 问题
* 子图
* 当前证据状态

输出：

* 候选假设
* 每个假设需要验证的关键点
* 支持/反驳它的预期证据类型

---

### `kg llm next-search-queries`

输入：

* question_id / gap_id / claim_id
* 当前子图
* 已搜过的 query 历史

输出：

* 下一轮推荐搜索词
* 排序原因
* 期望找到的证据类型

这个命令几乎就是你的“迭代深入搜索调研”引擎接口。

---

### `kg llm assess-evidence`

输入：

* claim_id
* 全部 supporting / contradicting evidence
* source metadata

输出：

* 当前 claim 状态建议
* 证据强弱判断
* 是否需要更多独立来源
* 推荐下一步动作

---

# 5. 给 coding agent 的完整方案

下面这部分尽量写成它可以直接落地的样子。

---

# 5.1 技术栈建议

既然你偏 TS/Node/Bun，我建议：

* **语言**：TypeScript
* **运行时**：Bun 或 Node.js
* **CLI**：commander / cac
* **存储 MVP**：SQLite + Drizzle ORM
* **图查询**：先自己做 adjacency + SQL，后续可接 Neo4j/Memgraph
* **向量/全文检索**：独立，不绑死在图里
* **JSON Schema 校验**：zod
* **日志/审计**：SQLite op_log 表

理由很简单：

* 先做本地可跑、可审计、可回滚
* 不要一上来就陷进图数据库生态里
* 你的核心价值不在“底层图存储”，而在“研究流程编排 + LLM 接口”

---

# 5.2 数据模型

建议统一基础表：

---

## `nodes`

```ts
type NodeKind =
  | "Entity"
  | "Claim"
  | "Source"
  | "Evidence"
  | "Observation"
  | "Question"
  | "Hypothesis"
  | "Gap"
  | "Task"
  | "Value";

interface BaseNode {
  id: string;
  kind: NodeKind;
  type?: string;
  title?: string;
  text?: string;
  summary?: string;
  status?: string;
  confidence?: number;
  attrs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

---

## `edges`

```ts
interface Edge {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  directed: boolean;
  confidence?: number;
  attrs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

---

## `evidence_links`

专门记录 Evidence 对什么对象起什么作用。

```ts
type EvidenceLinkTargetType = "node" | "edge";

interface EvidenceLink {
  id: string;
  evidenceId: string;
  targetType: EvidenceLinkTargetType;
  targetId: string; // node id or edge id
  role: "supports" | "contradicts" | "mentions" | "qualifies";
  confidence?: number;
  createdAt: string;
}
```

这个表非常重要。
它允许你说：

* 某条 evidence 支持某个 claim 节点
* 某条 evidence 反驳某条 claim 节点
* 某条 evidence 提到了某个 entity
* 某条 evidence 修饰某条 edge

---

## `tasks`

```ts
interface Task {
  id: string;
  title: string;
  goal: string;
  status: "active" | "paused" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}
```

---

## `node_task_links`

便于多任务隔离。

---

## `op_logs`

```ts
interface OpLog {
  id: string;
  opType: string;
  actor: string; // human / llm / agent
  taskId?: string;
  payload: unknown;
  createdAt: string;
}
```

---

# 5.3 节点类型的最小字段约束

建议 coding agent 用 zod 做 schema。

---

## Entity

```ts
const EntitySchema = z.object({
  id: z.string(),
  kind: z.literal("Entity"),
  type: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  summary: z.string().optional(),
  attrs: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1).optional()
});
```

---

## Claim

```ts
const ClaimSchema = z.object({
  id: z.string(),
  kind: z.literal("Claim"),
  text: z.string(),
  claimType: z.string(),
  status: z.enum([
    "proposed",
    "supported",
    "weakly_supported",
    "contested",
    "contradicted",
    "deprecated",
    "superseded"
  ]),
  confidence: z.number().min(0).max(1).optional(),
  attrs: z.record(z.string(), z.unknown()).default({})
});
```

---

## Source

```ts
const SourceSchema = z.object({
  id: z.string(),
  kind: z.literal("Source"),
  sourceType: z.enum(["webpage", "pdf", "forum", "repo", "dataset", "note", "other"]),
  title: z.string(),
  uri: z.string(),
  attrs: z.record(z.string(), z.unknown()).default({})
});
```

---

## Evidence

```ts
const EvidenceSchema = z.object({
  id: z.string(),
  kind: z.literal("Evidence"),
  sourceId: z.string(),
  snippet: z.string(),
  quote: z.string().optional(),
  locator: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1).optional(),
  attrs: z.record(z.string(), z.unknown()).default({})
});
```

---

## Question

```ts
const QuestionSchema = z.object({
  id: z.string(),
  kind: z.literal("Question"),
  text: z.string(),
  status: z.enum(["open", "in_progress", "resolved", "blocked", "obsolete"]),
  priority: z.number().min(0).max(1).optional(),
  attrs: z.record(z.string(), z.unknown()).default({})
});
```

---

# 5.4 CLI 命令分组设计

---

## 1) 基础图谱命令

```bash
kg node get <id>
kg node list --kind Entity
kg node upsert --json-in file.json
kg node delete <id>

kg edge create --from ent_1 --type related_to --to ent_2
kg edge get <id>
kg edge list --from ent_1
kg edge delete <id>
```

---

## 2) 证据命令

```bash
kg source add --json-in source.json
kg source get <id>

kg evidence add --json-in evidence.json
kg evidence get <id>
kg evidence link --evidence ev_1 --target clm_1 --role supports
kg evidence list --target clm_1
```

---

## 3) Claim 命令

```bash
kg claim add --json-in claim.json
kg claim get <id>
kg claim list --status supported
kg claim set-status <id> supported
kg claim conflicts <id>
kg claim merge <id1> <id2>
```

---

## 4) Question / Gap / Hypothesis 命令

```bash
kg question add --json-in question.json
kg question get <id>
kg question list --status open

kg hypothesis add --json-in hyp.json
kg gap detect --task task_1
kg gap list --task task_1
```

---

## 5) 子图查询命令

```bash
kg graph neighbors <id> --depth 2
kg graph path <from> <to> --max-depth 4
kg graph subgraph --task task_1 --focus ent_1
kg graph stats --task task_1
kg graph lint --task task_1
```

---

## 6) 面向 LLM 的研究命令

这部分是你真正的差异化。

```bash
kg llm extract-entities --source src_1 --task task_1 --emit-llm-task
kg llm extract-observations --source src_1 --task task_1 --emit-llm-task
kg llm extract-claims --source src_1 --task task_1 --emit-llm-task
kg llm normalize-entities --task task_1 --emit-llm-task
kg llm normalize-claims --task task_1 --emit-llm-task
kg llm generate-questions --task task_1 --emit-llm-task
kg llm generate-hypotheses --task task_1 --emit-llm-task
kg llm next-search-queries --task task_1 --emit-llm-task
kg llm assess-evidence --claim clm_1 --emit-llm-task
```

---

# 5.5 `--emit-llm-task` 返回格式

建议统一一个协议。

```ts
interface LlmTaskEnvelope {
  taskType: string;
  taskId?: string;
  graphContext: {
    focusNodeIds?: string[];
    relatedNodes: BaseNode[];
    relatedEdges: Edge[];
    relatedEvidence: BaseNode[];
  };
  inputContext: Record<string, unknown>;
  instructions: string;
  recommendedPrompt: string;
  outputSchema: Record<string, unknown>;
  executionHint?: {
    suggestedCommand: string;
    dryRunCommand?: string;
  };
}
```

---

## 示例：`kg llm extract-claims --source src_1 --task task_1 --emit-llm-task`

返回：

```json
{
  "taskType": "extract_claims",
  "taskId": "task_1",
  "graphContext": {
    "focusNodeIds": ["src_1"],
    "relatedNodes": [
      {
        "id": "ent_gemma4",
        "kind": "Entity",
        "type": "Product",
        "title": "Gemma 4 31B"
      },
      {
        "id": "ent_mmlu_pro",
        "kind": "Entity",
        "type": "Benchmark",
        "title": "MMLU Pro"
      }
    ],
    "relatedEdges": [],
    "relatedEvidence": []
  },
  "inputContext": {
    "source": {
      "id": "src_1",
      "title": "Gemma 4 Technical Report",
      "uri": "https://example.com/report"
    },
    "existingClaims": [
      {
        "id": "clm_1",
        "text": "Gemma 4 31B is a mixture-of-experts model"
      }
    ]
  },
  "instructions": "Extract candidate factual claims from the source. Reuse existing entities when possible. Prefer atomic, verifiable claims.",
  "recommendedPrompt": "You are given a source and graph context. Extract candidate claims...",
  "outputSchema": {
    "type": "object",
    "properties": {
      "claims": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "text": {"type": "string"},
            "claimType": {"type": "string"},
            "subjectRefs": {"type": "array"},
            "objectRefs": {"type": "array"},
            "suggestedEvidenceSpans": {"type": "array"},
            "confidence": {"type": "number"}
          },
          "required": ["text", "claimType"]
        }
      }
    },
    "required": ["claims"]
  },
  "executionHint": {
    "suggestedCommand": "kg claim add --json-in claims.json",
    "dryRunCommand": "kg claim add --json-in claims.json --dry-run"
  }
}
```

---

# 5.6 Prompt 生成策略

你提到希望 CLI 能输出“结合已有信息 + 给 LLM 的 prompt”。
那就不要每个命令手工拼 prompt，应该做成模板系统。

---

## Prompt 模板的基本变量

```ts
interface PromptTemplateContext {
  task: Task | null;
  source?: Source;
  focusNodes?: BaseNode[];
  relatedClaims?: BaseNode[];
  relatedEvidence?: BaseNode[];
  openQuestions?: BaseNode[];
  knownSchema?: {
    entityTypes: string[];
    claimTypes: string[];
    predicates: string[];
  };
}
```

---

## Prompt 模板目录建议

```bash
src/prompts/
  extract-entities.ts
  extract-observations.ts
  extract-claims.ts
  normalize-entities.ts
  normalize-claims.ts
  generate-questions.ts
  generate-hypotheses.ts
  next-search-queries.ts
  assess-evidence.ts
```

每个模板导出：

```ts
export function buildPrompt(ctx: PromptTemplateContext): string
export function outputSchema(): object
```

---

# 5.7 coding agent 的模块拆分建议

目录建议：

```bash
src/
  cli/
    commands/
      node.ts
      edge.ts
      source.ts
      evidence.ts
      claim.ts
      question.ts
      graph.ts
      llm.ts

  core/
    models/
      node.ts
      edge.ts
      claim.ts
      evidence.ts
      question.ts
    schemas/
      entity.ts
      claim.ts
      source.ts
      evidence.ts
    services/
      graph-service.ts
      evidence-service.ts
      claim-service.ts
      question-service.ts
      gap-service.ts
      llm-task-service.ts
      normalization-service.ts
      lint-service.ts

  db/
    schema.ts
    migrations/
    repositories/

  prompts/
    extract-entities.ts
    extract-observations.ts
    extract-claims.ts
    normalize-entities.ts
    normalize-claims.ts
    generate-questions.ts
    generate-hypotheses.ts
    next-search-queries.ts
    assess-evidence.ts

  utils/
    ids.ts
    json.ts
    logger.ts
    time.ts
```

---

# 5.8 核心服务怎么分工

---

## `GraphService`

职责：

* 创建/读取节点边
* 查询 neighbors/path/subgraph
* task 范围过滤

---

## `EvidenceService`

职责：

* evidence 创建
* evidence link
* 按 target 聚合支持/反驳证据

---

## `ClaimService`

职责：

* claim 创建、状态更新
* claim 冲突检测
* claim 合并

---

## `GapService`

职责：

* 扫描薄弱 claim
* 检测无证据 claim
* 检测单来源 claim
* 检测 unresolved questions

---

## `LlmTaskService`

职责：

* 从图中截取当前上下文
* 选择 prompt 模板
* 拼装 `LlmTaskEnvelope`
* 输出给上层 agent

这个服务是整个系统的关键。

---

# 6. 推荐给 coding agent 的实现顺序

不要让它一上来做全套。

---

## Phase 1：底层图谱和证据

必须做：

* nodes / edges / evidence_links / tasks / op_logs 表
* `kg node/edge/source/evidence/claim/question` 基础命令
* `kg graph neighbors/subgraph/stats`
* `kg evidence link/list`
* `kg claim set-status/conflicts`

---

## Phase 2：LLM task emission

做：

* `kg llm extract-entities --emit-llm-task`
* `kg llm extract-claims --emit-llm-task`
* `kg llm generate-questions --emit-llm-task`
* `kg llm next-search-queries --emit-llm-task`

---

## Phase 3：规范化与缺口检测

做：

* `kg llm normalize-entities`
* `kg llm normalize-claims`
* `kg gap detect`
* `kg llm assess-evidence`

---

## Phase 4：审计与稳态

做：

* `--dry-run`
* op_log
* `kg graph lint`
* undo/patch

---

# 7. 需要明确告诉 coding agent 的几个约束

这个很重要，我直接帮你写成“实现要求”。

---

## 实现要求 1

所有写操作必须支持：

* `--json-in`
* `--dry-run`
* 结构化错误输出

---

## 实现要求 2

所有 `kg llm *` 命令默认不直接调用 LLM，只负责输出：

* graph context
* instructions
* recommended prompt
* output schema
* execution hint

也就是 CLI 只做**任务编排**，不直接耦合某个模型。

---

## 实现要求 3

Evidence 必须允许链接到：

* node
* edge

但系统语义上优先鼓励：

* evidence → claim

---

## 实现要求 4

Claim 必须是一等节点，而不是边的附属属性。

---

## 实现要求 5

Question / Gap / Hypothesis 必须是一等节点，不可只存在内存里。

---

# 8. 一份可以直接交给 coding agent 的任务描述

下面这段你可以几乎原样发给 coding agent。

---

## Coding Agent 任务说明

请实现一个面向 LLM 调用的知识图谱 CLI，用于“迭代深入搜索调研”。

### 目标

该 CLI 不是为人工交互优化，而是为上层 agent/LLM 提供稳定、可组合的图谱操作能力与 LLM 任务编排能力。

### 核心要求

1. 支持以下节点类型：

   * Entity
   * Claim
   * Source
   * Evidence
   * Observation
   * Question
   * Hypothesis
   * Gap
   * Task
   * Value

2. 支持以下核心关系：

   * Source contains Evidence
   * Evidence supports / contradicts / mentions Node
   * Claim about_subject / about_object / answers Question
   * Question about / investigates / motivated_by Gap

3. Claim 必须是一等节点，用于表达可验证、可反驳、可过时的断言。

4. Evidence 必须支持链接到 node 或 edge，但系统应优先支持 evidence → claim 的主路径。

5. 实现基础 CLI 命令：

   * node get/list/upsert/delete
   * edge create/get/list/delete
   * source add/get
   * evidence add/get/link/list
   * claim add/get/list/set-status/conflicts
   * question add/get/list
   * graph neighbors/subgraph/stats/lint
   * gap detect/list

6. 实现面向 LLM 的命令：

   * llm extract-entities
   * llm extract-observations
   * llm extract-claims
   * llm normalize-entities
   * llm normalize-claims
   * llm generate-questions
   * llm generate-hypotheses
   * llm next-search-queries
   * llm assess-evidence

7. 所有 `llm` 命令默认不直接调用模型，而是输出统一的 `LlmTaskEnvelope` JSON，内容包括：

   * taskType
   * graphContext
   * inputContext
   * instructions
   * recommendedPrompt
   * outputSchema
   * executionHint

8. 所有写操作必须支持：

   * `--json-in`
   * `--dry-run`
   * JSON 错误输出

9. 使用 TypeScript 实现，MVP 存储采用 SQLite + Drizzle ORM，使用 zod 做 schema 校验。

10. 必须实现 op log，用于记录每次写操作。

### 实现优先级

P0:

* 数据模型
* 基础 CLI
* evidence link
* claim status/conflicts
* graph neighbors/subgraph/stats
* llm extract-claims / generate-questions / next-search-queries

P1:

* normalize-entities / normalize-claims
* gap detect
* graph lint
* dry-run patch preview

---

# 9. 我对你这个方案的一个直接建议

你这个系统里，**最容易被低估的模块不是图数据库，而是 `llm-task-service`**。

因为真正值钱的是：

* 不只是“存知识”
* 而是把当前图中的：

  * 已知事实
  * 争议 claim
  * 关键证据
  * 未解决问题
  * 结构性缺口
* 一起整理成下一次 LLM 调用的上下文

换句话说，你的 CLI 最终不是一个“图谱管理器”，而是一个：

> **研究代理的图谱操作系统**

图数据库只是下面那层。

---

如果你要，我下一步可以继续给你补两块中的任意一块：

1. **完整 JSON Schema / TypeScript 接口定义**
2. **CLI 命令逐条展开为 `usage + input + output + 示例` 的规格文档**


