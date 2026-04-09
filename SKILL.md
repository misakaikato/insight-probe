---
name: insight-probe
description: |
  图谱驱动的迭代式深度调研工具。使用 knowledge-graph-cli (kg) 管理研究图谱，LLM 负责理解和生成，CLI 负责存储和编排。
  Use when: 调研, 研究, 深入了解, 深度调研, investigate, probe, deep research, 帮我查一下, 深入分析, 系统调研
  DO NOT TRIGGER when: 仅需要简单查找 / 股票查询（用 xueqiu）
metadata:
  version: "5.1.0"
  category: research
  license: MIT
  last_updated: "2025-04-09"
  repository: "https://github.com/misakaikato/insight-probe"
---

> **更新提示**（上次检查：加载 skill 时）：
> - `version: 5.1.0` — 最新版本。如果检测到本地版本低于此值，说明有更新，请告知用户。
> - 如需查看完整更新历史：`<CLI_PATH>/CHANGELOG.md`

## 自然语言接口

用户可以用以下方式启动调研，Agent 自动映射到对应路由：

| 用户说法 | 映射路由 | 说明 |
|---------|---------|------|
| "帮我调研一下 XXX"、"深入了解 XXX"、"系统调研 XXX" | NEW_TOPIC → CONTINUE | 完整深度调研流程 |
| "先帮我广泛收集一下 XXX 的信息" | NEW_TOPIC → SEARCH_ONLY | 搜索优先，快速覆盖 |
| "继续上次的调研" | CONTINUE | 从图谱继续 |
| "生成报告" | REPORT | 输出结构化报告 |
| "检查一下图谱质量" | STATS / LINT | 图谱诊断 |
| "更新一下这个 skill"、"更新 insight-probe" | UPDATE_SKILL | 从 GitHub 拉取最新版本 |

> **技能共享**：当你需要向其他人描述这个工具时，可以说：
> "这是一个图谱驱动的深度调研工具。你可以像跟研究助手对话一样让它帮你系统地研究任何主题——它会通过多轮搜索、提取、整理知识，最后生成结构化报告。整个过程用知识图谱记录，保证信息可追溯。"

# Insight Probe

图谱驱动的迭代式深度调研。知识图谱 CLI (`kg`) 管理节点/边/证据/命题，Agent 通过 `kg llm *` 获取任务信封，自身 LLM 执行提取与分析，结果写回图谱。

---

## Route Table

| 场景 | 路由 | 操作 |
|------|------|------|
| 开始新调研 | NEW_TOPIC | `kg new-topic "主题"` → 初始化目录 + kg.json |
| 搜索优先调研 | SEARCH_ONLY | 搜索→即时提取→读取高优先级页面→判断收敛（最大化覆盖率，不生成报告） |
| 继续调研 | CONTINUE | 推导方向 → 搜索 → 去重写入来源 → 抓取 → `kg llm extract-*` → **深度提取** → 规范化 → 质量门控 → 检测缺口 → 判断收敛 |
| 质量门控 | STATS | `kg graph stats --dir <dir>` → 检查 proposition 平均长度、证据数是否达标 |
| 图谱检查 | LINT | `kg graph lint --dir <dir>` |
| 检测缺口 | GAP | `kg graph gaps --detect --dir <dir>` |
| 生成报告 | REPORT | `kg llm generate-report --topic <主题> --dir <dir>` → LLM 生成结构化报告；`kg graph report` → 程序化快速检查 |

> **SEARCH_ONLY vs CONTINUE**：SEARCH_ONLY 适合"先广泛收集信息"，搜索结果出来后立即提取（阈值较低），页面读取仅限高优先级。CONTINUE 适合"深度分析"，每个页面都深度提取，质量门槛更高。

---

## UPDATE_SKILL 路由：从 GitHub 更新

```bash
# 克隆仓库（首次）
git clone https://github.com/misakaikato/insight-probe.git /tmp/insight-probe

# 已有仓库则拉取最新
cd <本地仓库路径>
git pull origin main

# 复制最新的 skill 文件到目标位置
cp /tmp/insight-probe/SKILL.md ~/.hermes/skills/insight-probe/SKILL.md
# 或目标路径为其他 skill 管理器配置的位置

# 对比版本，确认更新内容
git log --oneline <旧版本commit>..<新版本commit>
```

**更新检查流程**：
1. 对比本地 `~/.hermes/skills/insight-probe/SKILL.md` 的 `version` 与 metadata 中的 `5.1.0`
2. 若低于 `5.1.0` → 告知用户有可用更新，询问是否拉取
3. 拉取后显示 changelog diff

---

## CLI 工具位置

```bash
# 方式一：从 skill 目录动态推导（推荐）
CLI_PATH="$(cd ../.. && pwd)/tools/knowledge-graph-cli"

# 方式二：设置环境变量
export KG_CLI_PATH="/你的/项目/路径/tools/knowledge-graph-cli"

# 验证 CLI 可用
bun run $CLI_PATH/src/cli/index.ts --version
```

所有命令通过 `bun run $CLI_PATH/src/cli/index.ts` 执行，可 alias 为 `kg`：

```bash
# 将下方路径替换为你的实际路径
alias kg="bun run /你的/实际/路径/tools/knowledge-graph-cli/src/cli/index.ts"
```

---

## 核心原则

- **ALWAYS** 从图谱推导搜索方向（`kg llm next-search-queries`），禁止预设模板
- **ALWAYS** 使用 `opencli web search <keyword>` 搜索
- **ALWAYS** 页面读取使用 `opencli web read --url "xxx"`；B 站视频用 `opencli bilibili subtitle <bvid>`（Step 4 详述）
- **ALWAYS** 来源写入图谱：`echo '{...}' | kg node upsert --json-in - --dir <dir>`
- **ALWAYS** 维护任务外置记忆：每个 `taskId` 对应 `{dir}/tasks/<taskId>/tasks.md`；`kg task continue` 会自动追加本轮计划，高频图谱命令会自动勾选对应步骤，临时新增工作仍需手动追加
- **NEVER** 让 CLI 直接调用 LLM — `kg llm *` 只输出任务信封，Agent 自身执行
- **NEVER** 使用 xueqiu 进行通用调研（仅限股票）
- **NEVER** 跳过 `kg graph lint` — 每轮结束时检查图谱质量
- **NEVER** 跳过 `kg llm extract-*` — 必须用 LLM Task Envelope 的 recommendedPrompt 深度提取，禁止直接 upsert 一句话 proposition
- **FIRST SEARCH CONSTRAINT** 当图谱为空（第一轮冷启动）时，搜索词必须**保持用户原始表述的完整语义**，禁止对主题进行过多前置加工或假设。如果用户表述存在歧义或过于宽泛，应先基于完整语义搜索，再根据搜索结果判断是否需要澄清或收窄。
  - 用户表述清晰 → 直接作为搜索词，不做前置假设
  - 用户表述宽泛模糊 → 先搜索，根据结果再判断是否需要澄清
  - 用户表述有明显歧义 → 先搜索，同时基于合理解读生成补充搜索
- **CONFIRM BEFORE FIRST SEARCH** 冷启动时，**必须**先向用户确认理解，再调用 `next-search-queries`（详见 NEW_TOPIC 路由下的"冷启动确认"小节）

---

## Prerequisites

| 依赖 | 检查 | 说明 |
|------|------|------|
| Bun | `bun --version` | 运行 CLI |
| opencli | `opencli doctor` | 搜索 + 页面读取 |
| SearXNG | `curl http://127.0.0.1:10086` | 可选，通用搜索 |

---

## NEW_TOPIC 路由

```bash
kg new-topic "Gemma4 模型评测"
# → 输出：{ topic, dir, file, taskId, taskDir, tasksFile }
# → 同时初始化 {dir}/search_results 和 {dir}/pages
# 记住 dir 路径，后续所有命令都用 --dir <dir>

# 创建任务
kg task create --title "调研任务" --goal "目标" --dir <dir>
# → 自动创建 {dir}/tasks/<taskId>/tasks.md
```

**⚠️ 冷启动确认步骤**：初始化任务后，**必须**先向用户确认对其调研主题的理解，再调用 `kg llm next-search-queries`。

冷启动时图谱无上下文，`next-search-queries` 只能依赖 LLM 对主题的先验知识。直接跳到预设的"认知偏差"等框架会窄化主题。例如"自然随机性和人类的认知"不应被窄化为"随机性认知偏差"，而应先搜索"自然随机性 认知"、"randomness cognition"等保持语义完整的表述。

向用户确认时需说明：
1. 你对主题的初步解读（不预设框架，基于语义完整理解）
2. 计划从哪些维度展开探索
3. 请求用户确认或纠正

**示例**：
> 我对"自然随机性和人类的认知"的理解：
> - 这个主题涉及两个方面：① 自然随机性的科学定义和本质；② 人类如何认知/理解随机性，以及这种认知有哪些特点和局限
> - 我计划从以下维度展开探索：自然随机性的数学和物理基础、人类对随机性的直觉判断特点、随机性与 pattern recognition 的关系等
> - 请确认这个理解是否准确，或者你有其他想要重点探讨的方向？

**用户纠正后**：根据反馈重新调用 `next-search-queries`，用修正后的语义作为输入，丢弃当前候选搜索词。

```bash
# 查看 / 追加 / 勾选任务项
kg task checklist <taskId> --dir <dir>
kg task add-item <taskId> --text "补充第三方验证来源" --dir <dir>
kg task check <taskId> --item <taskItemId> --dir <dir>
kg task uncheck <taskId> --item <taskItemId> --dir <dir>
```

---

## SEARCH_ONLY 路由：搜索优先模式

最大化信息收集覆盖率，不生成报告。搜索结果出来后**立即提取**，页面读取仅限高优先级来源。

**质量阈值**（比 CONTINUE 更宽松）：

| 节点类型 | 要求 |
|---------|------|
| Proposition | ≥30字 |
| Evidence | ≥15字 |
| Source | **必须写入**（搜索结果本身就是数据） |

**收敛标准**：连续 3 轮无新来源 → **停下来向用户确认**；达到 20 轮强制提示。

**提示用户格式**：
> 已收集 X 个来源，连续 3 轮无新增。是否继续搜索？
> - 继续 → 从新角度生成搜索词
> - 停止 → 退出搜索循环，可切换到 REPORT 生成报告

### 搜索循环

```
Round N:
1. kg llm next-search-queries --task <taskId> --dir <dir>
2. opencli web search "关键词" --limit 10 -f json -o ...
   opencli web search "keyword_en" --limit 10 -f json -o ...
3. 从搜索结果即时提取 → 写入图谱（title→Entity，snippet→Proposition）
4. 读取高优先级页面（P0 Wikipedia/ArXiv/知乎高赞，P1 权威媒体）
5. kg node upsert (type: Source) 写入来源
6. 收敛检查 → 继续或提示用户
```

**即时提取方式**：Agent 用自身 LLM 直接从搜索结果 JSON 提取（title/snippet），无需调用 `kg llm extract-*`。提取后直接 upsert 到图谱。

**提取映射**：
- title 含人名 → Entity(Person)
- title 含书名/作品名 → Entity(Work)
- title 含概念 → Entity(Concept)
- snippet 含定义/对比/关系 → Proposition/Edge
- snippet 含"A 是 B 的作者/相关" → Edge(related_to)

---

## CONTINUE 路由：调研循环

先用 `task continue` 刷新本轮计划：

```bash
kg task continue <taskId> --dir <dir>
# → 自动在 tasks.md 追加 `Round N` 小节
# → 自动勾选"从图谱推导下一步搜索方向"
# → 返回当前 phase / nextQueries / checklist 摘要
```

### Step 1: 推导搜索方向

```bash
kg llm next-search-queries --task <taskId> --dir <dir>
# → 输出 LlmTaskEnvelope，包含 recommendedPrompt 和 graphContext
# Agent 用自身 LLM 执行后得到搜索词列表
```

**优先级**（当没有 next-search-queries 时）：
1. open Proposition（status=open）→ 直接作为查询
2. 缺口（`kg graph gaps --detect`）→ 按缺口类型扩展查询
3. 新实体 → 多维度查询

### Step 2: 搜索

```bash
opencli web search "{q}" --limit 8 -f json -o "{dir}/search_results/r{n}_q{m}_opencli.json"
opencli web search "{q_en}" --limit 8 -f json -o "{dir}/search_results/r{n}_q{m}_opencli_en.json"

# 把外部搜索产物同步回 tasks.md，并自动推进 runSearch
kg task sync-artifacts <taskId> --dir <dir>
```

### Step 3: URL 去重 + 写入来源

**去重逻辑**：
```bash
# 用 jq 提取 URL，按 host 去重，保留质量最高的
cat search_results/r1_q1_opencli.json | jq -r '.results[].url' | \
  sort -u | grep -v '^$' | \
  while read url; do
    host=$(echo "$url" | jq -Rs 'split("/")[2]')
    echo "$host $url"
  done | sort -u | sort -t' ' -k1 | uniq -w20 | awk '{print $2}' | head -5
```
1. 从搜索结果 JSON 提取所有 URL，按 host 去重
2. 保留质量最高的（wikipedia/arxiv/edu > reuters/bbc > zhihu/bilibili > blog/weibo）
3. 同一 domain 下最多保留 2 个 URL，最多取 5 个

**抓取数量**：按质量排序后，最多抓取 **5 个 URL**（避免单轮负担过重），优先保留学术/权威来源。

```bash
# 普通页面
echo '{"type":"Source","title":"页面标题","attrs":{"uri":"https://...","sourceType":"webpage","author":"..."}}' | \
  kg node upsert --json-in - --dir <dir>
# → 输出 source 节点，记住 id

# B 站视频（URL 匹配 bilibili.com/video/BV* 时）
echo '{"type":"Source","title":"视频标题","attrs":{"uri":"https://www.bilibili.com/video/BV...","sourceType":"video","author":"UP主名","platform":"bilibili"}}' | \
  kg node upsert --json-in - --dir <dir>
# → sourceType 设为 "video"，attrs.platform 设为 "bilibili"
```

**登录墙处理**：若 `opencli web read` 返回 401/403，标记该来源为 `"attrs":{"accessStatus":"blocked"}`，不影响其他来源继续抓取。

**页面优先级**：P0 必须读取（Wikipedia/ArXiv/知乎高赞），P1 尽力读取（权威媒体），P2 失败则降级到标题/摘要，P3 直接用标题/摘要即可。

### Step 4: 抓取页面

```bash
# 普通页面
opencli web read --url "{url}" --output "{dir}/pages" -f json

# B 站视频 → 拉取字幕（禁止用 web read 抓取视频页面）
# 从 URL 中提取 BV 号，例如 https://www.bilibili.com/video/BV1TH4y1c7Gv → BV1TH4y1c7Gv
opencli bilibili subtitle <bvid> -f json -o "{dir}/pages/<bvid>_subtitle.json"
# 字幕为 JSON 数组，每条包含 content/text 字段，拼接后即为视频完整文稿
# 后续 extract-* 步骤将字幕文本作为 source 内容进行提取
```

```bash
# 把页面抓取产物同步回 tasks.md，保留外置记忆
kg task sync-artifacts <taskId> --dir <dir>
```

### Step 5: 提取（Agent LLM 执行）

> **⚠️ 强制要求**：禁止跳过 `kg llm extract-*` 步骤。必须用 recommendedPrompt 深度提取页面内容，禁止直接 upsert 一句话 proposition。

**执行顺序**：`extract-entities` → `extract-claims` → `extract-relations`（三步串行）

理由：entities 是 claims 的锚点，relations 依赖前两者的输出。

```bash
# 获取提取任务信封
kg llm extract-entities --source <sourceId> --task <taskId> --dir <dir>
# → 推荐先执行，识别页面中提到的实体

kg llm extract-claims --source <sourceId> --task <taskId> --dir <dir>
# → 基于已识别的 entity 上下文，提取命题陈述

kg llm extract-relations --source <sourceId> --task <taskId> --dir <dir>
# → 建立 entity 间关系、entity 与 claim 间的边

# Agent 用自身 LLM 按 recommendedPrompt 执行提取
# recommendedPrompt 包含丰富的提取指令，确保知识深度
# 将结果写回图谱：
```

**深度提取标准**：

|| 节点类型 | 最低深度要求 | 示例 |
|---------|------------|------|
| Proposition (asserted) | ≥50字，含核心陈述+条件+证据+局限性 | "人类倾向于低估小样本变异性，在随机序列中感知虚假模式（如伦敦人认为 V-2 轰炸有特定模式，统计证明符合泊松分布）。局限性：该结论主要基于西方受试者实验。" |
| Evidence | ≥20字，原文片段直接引用 | "Gilovich argues that the clustering illusion occurs because people underpredict the amount of variability likely to appear in a small sample of random data" |
| Entity | 包含定义+关键属性+关联概念 | `{"type":"Entity","title":"Clustering illusion","attrs":{"entityType":"Concept","definition":"...","relatedConcepts":["Apophenia","Representativeness heuristic"]}}` |

### Step 5.1: 质量门控

每轮提取完成后，检查图谱深度：

```bash
kg graph stats --dir <dir>
```

**示例输出**：
```
Nodes: 42 (Entity:12, Source:8, Evidence:14, Proposition:8)
Edges: 67
Proposition avg length: 67.3 chars
Evidence count: 14 (≥ 命题数×1.5? ✓)
Open propositions: 3
```

**质量达标判断**：
- `Proposition avg length` ≥ 50字
- `Evidence count` ≥ Proposition数 × 1.5

**质量不达标时**：
- Proposition 过少 → 继续提取该来源
- Proposition 过短 → 补充完善现有 proposition
- 证据不足 → 补充 Evidence 节点

### Step 6: 规范化（每轮结束时）

**执行顺序**：`normalize-entities` → `normalize-claims`（先实体后命题）

两者的 recommendedPrompt 均由 LLM Task Envelope 提供，Agent 用自身 LLM 执行后，CLI 自动合并重复节点。

```bash
# 实体去重
kg llm normalize-entities --task <taskId> --dir <dir>

# 命题去重
kg llm normalize-claims --task <taskId> --dir <dir>
```
### Step 7-9: 规范化 → 缺口检测 → 收敛判断

```bash
# 规范化（先实体后命题）
kg llm normalize-entities --task <taskId> --dir <dir>
kg llm normalize-claims --task <taskId> --dir <dir>

# 生成问题 + 假设
kg llm generate-questions --task <taskId> --dir <dir>
kg llm generate-hypotheses --task <taskId> --dir <dir>

# 检测缺口（返回 missing_evidence/weak_support/unanswered/orphan 四类，按 severity 排序）
kg graph gaps --detect --dir <dir>
# → top 缺口转化为下一轮搜索词

# 评估证据（可选，针对特定命题）
kg llm assess-evidence --proposition <propositionId> --dir <dir>

# 判断收敛
kg node list --kind Proposition --status open --dir <dir>
# 有 open Proposition 且 ≤ 10 轮 → 继续；连续 2 轮无新节点 → 收敛；达到 10 轮 → 强制停止
```

---

## 命令速查

### 节点操作

```bash
kg node get <id> --dir <dir>
kg node list [--kind Entity|Source|Evidence|Proposition] [--status open] [--task <taskId>] --dir <dir>
kg node upsert --json-in <file|-> [--task <taskId>] --dir <dir>
kg node delete <id> --dir <dir>
kg node set-status <id> <status> --dir <dir>
kg node conflicts <id> --dir <dir>
kg node merge <id1> <id2> --dir <dir>
```

### 边操作

```bash
kg edge create --from <id> --type <relation> --to <id> [--confidence 0.8] --dir <dir>
kg edge get <id> --dir <dir>
kg edge list [--from <id>] [--type <relation>] --dir <dir>
kg edge delete <id> --dir <dir>
```

### 证据

```bash
echo '{"sourceId":"src_xxx","snippet":"引用片段"}' | kg evidence add --json-in - --dir <dir>
kg evidence get <id> --dir <dir>
kg evidence link --evidence <evId> --target <nodeId> --role supports|contradicts|mentions|qualifies --dir <dir>
kg evidence list --target <nodeId> --dir <dir>
```

### 图谱查询

```bash
kg graph neighbors <id> [--depth 2] --dir <dir>
kg graph path <from> <to> [--max-depth 4] --dir <dir>
kg graph subgraph [--focus <id>] [--depth 2] --dir <dir>
kg graph stats --dir <dir>
kg graph lint --dir <dir>
kg graph gaps --detect [--task <taskId>] --dir <dir>
kg graph report [--task <taskId>] [--title <title>] --dir <dir>
kg graph citations [--task <taskId>] --dir <dir>
kg graph export-html [--focus <id>] [--depth 2] --dir <dir>
```

### LLM 任务信封

```bash
kg llm extract-entities --source <id> [--task <taskId>] --dir <dir>
kg llm extract-observations --source <id> [--task <taskId>] --dir <dir>
kg llm extract-claims --source <id> [--task <taskId>] --dir <dir>
kg llm extract-relations --source <id> [--task <taskId>] --dir <dir>
kg llm normalize-entities [--task <taskId>] --dir <dir>
kg llm normalize-claims [--task <taskId>] --dir <dir>
kg llm normalize-predicates [--task <taskId>] --dir <dir>
kg llm generate-questions [--task <taskId>] --dir <dir>
kg llm generate-hypotheses [--task <taskId>] --dir <dir>
kg llm next-search-queries [--task <taskId>] --dir <dir>
kg llm assess-evidence --proposition <id> --dir <dir>
kg llm generate-report [--task <taskId>] [--topic <topic>] --dir <dir>
```

所有 `llm` 命令输出 `LlmTaskEnvelope` JSON：
```json
{
  "taskType": "extract_claims",
  "graphContext": { "focusNodeIds": [...], "relatedNodes": [...], "relatedEdges": [...] },
  "inputContext": { ... },
  "instructions": "...",
  "recommendedPrompt": "...",
  "outputSchema": { ... },
  "executionHint": { "suggestedCommand": "kg node upsert --json-in ..." }
}
```

Agent 用 `recommendedPrompt` 调用自身 LLM，按 `outputSchema` 解析结果，用 `executionHint.suggestedCommand` 写回图谱。
当传入 `--task <taskId>` 时，信封会额外包含 `tasks.md` 的未完成事项，用于约束当前流程。

**`recommendedPrompt` 内容说明**：信封中的 recommendedPrompt 是一个对 LLM 友好的完整指令，包含：
- **任务目标**：本轮要提取什么（如"从页面中提取所有关于量子纠错的科学命题"）
- **深度要求**：每条输出的最低标准（如 Proposition ≥50字、必须包含机制和证据）
- **上下文信息**：graphContext 中相关节点的内容，供 LLM 参照已有图谱
- **输出格式**：按 outputSchema 的要求组织，通常是结构化 JSON 或 Markdown 列表

**常见 taskType 对应的 recommendedPrompt 用途**：

| taskType | recommendedPrompt 用途 |
|----------|----------------------|
| `extract-entities` | 列出页面中出现的所有实体（概念、技术名、人名等），附定义和别名 |
| `extract-claims` | 从页面提取可验证的命题，包含条件、证据来源、局限性 |
| `extract-relations` | 建立实体间、实体与命题间的边关系 |
| `next-search-queries` | 基于图谱上下文生成下一轮搜索词 |
| `normalize-entities` | 判断哪些实体指向同一对象，输出合并对 |
| `normalize-claims` | 判断哪些命题重复，输出保留哪条及理由 |
| `generate-questions` | 提出当前图谱未回答的研究问题 |
| `assess-evidence` | 评估某命题的证据链质量，给出支持/反驳/弱支持的判断 |

---

## 节点类型（5 种）

|| 类型 | type | 说明 | 关键字段 | 深度要求 |
|------|------|------|------|----------|---------|
|| 实体 | Entity | 客观对象 | title, attrs.entityType, attrs.aliases, attrs.definition | 包含定义+关联概念+来源 |
|| 来源 | Source | 原始来源 | title, text, summary, attrs.uri, attrs.sourceType | 完整元数据 |
|| 证据 | Evidence | 来源中的片段 | text, attrs.sourceId | **≥20字**，直接引用原文 |
|| 观察 | Observation | 原始观察（中间态） | text, attrs.sourceId | 由 `extract-observations` 生成，供后续提炼用 |
|| 命题 | Proposition | 统一命题类型 | text, status, confidence, attrs.propositionType | **≥50字**，包含机制/条件/证据 |

> **注意**：`extract-observations` 是可选的中间步骤，将页面内容拆解为原始观察片段，供 `extract-claims` 进一步提炼为命题。直接使用 `extract-claims` 亦可。

### Proposition 的 12 种 status

|| status | 含义 | 旧类型映射 | 说明 |
|--------|------|-----------|------|
|| unrefined | 原始观察 | Observation | 未经提炼的原始片段 |
|| open | 开放问题 | Question | 待回答的研究问题 |
|| hypothesized | 待验证假说 | Hypothesis | 待证据检验的假设 |
|| asserted | 来源断言 | Claim | 有来源支持的陈述 |
|| evaluating | 评估中 | — | 正在评估证据质量 |
|| supported | 证据支持 | Claim(supported) | 有多个独立来源支持 |
|| weakly_supported | 证据薄弱 | Claim(weakly_supported) | 仅单一来源或质量不足 |
|| contested | 有争议 | Claim(contested) | 不同来源结论矛盾 |
|| contradicted | 被反驳 | Claim(contradicted) | 有证据明确反驳 |
|| superseded | 被取代 | Claim(superseded) | 被更准确的命题取代 |
|| resolved | 已解决 | — | 问题已有充分答案 |
|| obsolete | 已过时 | — | 因新发现而失效 |

---

## 边类型（10 种）

| 边类型 | 说明 |
|--------|------|
| related_to | 通用关联 |
| evidence_link | 证据链接（attrs.role: supports/contradicts/mentions/qualifies） |
| derived_from | 推导关系 |
| contradicts | 矛盾关系 |
| supports | 支持关系 |
| supersedes | 取代关系 |
| answers | 回答关系 |
| raised_by | 提出关系 |
| predicts | 预测关系 |
| sourced_from | 来源关系 |

---

## Proposition 状态流转

```
unrefined → asserted → evaluating → supported → resolved
                     → weakly_supported → contested → contradicted
                                                 → superseded → obsolete
open → hypothesized → asserted → ...
                    → resolved
```

---

## 缺口检测（纯计算）

`kg graph gaps --detect` 不创建节点，返回 `GapResult[]`：

| gapType | 说明 | severity |
|---------|------|----------|
| missing_evidence | 命题无任何证据 | 0.8 |
| weak_support | 证据不充分（单一来源） | 0.5 |
| unanswered | open 命题尚未回答 | 0.6 |
| orphan | 节点无任何边连接 | 0.3 |

---

## 可靠性评级

|| 评级 | 来源 | 报告标注 |
||------|------|----------|
|| 高 | 官方、权威媒体、百科、arXiv | `可靠性：高` |
|| 中 | 行业分析、多方印证 | `可靠性：中` |
|| 低 | 单一来源、未经证实 | `可靠性：低` |

---

## 搜索来源

`opencli web search <keyword> --limit 8` — 默认并发搜索所有适配器。

专用站点（按需）：Wikipedia (`--lang en|zh`)、知乎、小红书、B站、HackerNews、Reddit、ArXiv。技术/英文主题优先 HN/Reddit/ArXiv；财经股票用 SearXNG + xueqiu。

---

## 产出体系

| 文件 | 生成方式 |
|------|----------|
| `final_report.md` | `kg llm generate-report` → LLM 生成结构化报告（推荐） |
| `final_report.md` | `kg graph report` → 程序化报告（快速检查用） |
| `research_record.md` | 调研过程记录（Agent 维护） |
| `kg.json` | 图谱原始数据（CLI 自动维护） |

---

## 报告生成与引用

### `kg llm generate-report` — 生成 LLM 填充的丰富报告

```bash
kg llm generate-report --topic <研究主题> --task <taskId> --dir <dir>
```

**功能**：
1. 遍历图谱中的 Proposition，获取其关联的 Evidence 和 Source
2. 汇总所有 open Proposition、缺口和来源信息
3. 调用 LLM 生成结构化报告（执行摘要 + 背景 + 核心发现 + 开放问题 + 参考文献）

### `kg graph report` — 程序化报告（快速检查用）

```bash
kg graph report --task <taskId> [--title <title>] --dir <dir>
```

---

## 目录结构

```
temp/{topic}_{timestamp}/
├── kg.json              # 唯一真相来源（CLI 维护）
├── search_results/      # 搜索原始结果
├── pages/               # 抓取页面全文
└── tasks/
    └── {taskId}/
        └── tasks.md     # 外置流程记忆 / checklist
```

---

## Checklist

- [ ] `opencli doctor` 检查连通性（首次使用 browser 站点）
- [ ] `kg new-topic` 创建目录，记住 `--dir` 路径
- [ ] 每个任务检查 `{dir}/tasks/<taskId>/tasks.md`，确认本轮待办
- [ ] 每个搜索结果写入 Source 节点
- [ ] 搜索结果保存到 `search_results/`
- [ ] 页面用 `opencli web read` 抓取；B 站视频用 `opencli bilibili subtitle <bvid>` 拉取字幕
- [ ] 每次外部搜索 / 页面抓取后执行 `kg task sync-artifacts <taskId> --dir <dir>`
- [ ] 抓取后用 `kg llm extract-*` 获取任务信封
- [ ] Agent LLM 按 recommendedPrompt **深度提取**，禁止标题式 proposition
- [ ] Proposition ≥50字，包含完整知识（机制+条件+证据）
- [ ] Evidence ≥20字，直接引用原文
- [ ] 每轮结束：`kg graph lint` + `kg graph gaps --detect` + `kg graph stats`（检查深度）
- [ ] 优先依赖自动同步：`task continue`、`node upsert`（正文齐全时）、`evidence add/link`、`edge create`、`graph gaps/stats/lint`
- [ ] 遇到临时新增工作或自动同步未覆盖的动作，再用 `kg task check` / `kg task add-item`
- [ ] 报告每个发现标注可靠性等级
- [ ] `kg graph report` 生成最终报告（深度达标后执行）

---

## 常见问题

| 症状 | 排查 |
|------|------|
| opencli 登录失败/cookie 过期 | 运行 `opencli <site> login` |
| `kg` 命令报错 Not found | 检查 `--dir` 路径是否正确 |
| 搜索返回空结果 | `browser: true` 站点需先 `opencli doctor` 检查 |
| `kg graph lint` 报孤立节点 | Source 节点本身不需要边连接，可忽略 |
| 调研收敛过快 | 检查 `kg node list --kind Proposition --status open` 是否有未解决问题 |
| Proposition 无证据支持 | `kg llm assess-evidence --proposition <id>` 评估证据质量 |
| glob 匹配中文目录失败 | 用双引号而非单引号包裹模式：`glob "pages/**/*"` |
| 报告空洞/过于简略 | 图谱深度不足，检查 proposition 是否≥50字，evidence 是否≥20字 |
| proposition 过于简化 | 禁止跳过 `kg llm extract-*`，必须用 recommendedPrompt 深度提取 |
| 旧数据 kg.json 兼容 | CLI 自动迁移：`kind` → `type`，`evidenceLinks` → `evidence_link` 边 |
