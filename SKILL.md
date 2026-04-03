---
name: insight-probe
description: |
  图谱驱动的迭代式深度调研工具。使用 knowledge-graph-cli (kg) 管理研究图谱，LLM 负责理解和生成，CLI 负责存储和编排。
  Use when: 调研, 研究, 深入了解, 深度调研, investigate, probe, deep research
  DO NOT TRIGGER when: 仅需要简单查找 / 股票查询（用 xueqiu）
license: MIT
metadata:
  version: "4.0.0"
  category: research
---

# Insight Probe

图谱驱动的迭代式深度调研。知识图谱 CLI (`kg`) 管理节点/边/证据/断言/问题/缺口，Agent 通过 `kg llm *` 获取任务信封，自身 LLM 执行提取与分析，结果写回图谱。

---

## Route Table

| 意图 | 路由 | 操作 |
|------|------|------|
| 开始新调研 | NEW_TOPIC | `kg new-topic "主题"` → 初始化目录 + kg.json |
| 继续调研 | CONTINUE | 推导方向 → 搜索 → 抓取 → 写入来源 → `kg llm extract-*` → LLM 分析 → 写回图谱 → 判断收敛 |
| 查看统计 | STATS | `kg graph stats --dir <dir>` |
| 图谱检查 | LINT | `kg graph lint --dir <dir>` |
| 检测缺口 | GAP | `kg gap detect --dir <dir>` |
| 生成报告 | REPORT | `kg graph subgraph --dir <dir>` → 基于图谱生成报告 |

---

## CLI 工具位置

```bash
# 从 skill 目录执行时，使用绝对路径
CLI_PATH="$(cd ../.. && pwd)/tools/knowledge-graph-cli"
# 或直接用绝对路径
CLI_PATH="/Users/mayu/Projects/Agent/skills/insight-probe/tools/knowledge-graph-cli"
```

所有命令通过 `bun run $CLI_PATH/src/cli/index.ts` 执行，可 alias 为 `kg`：

```bash
alias kg="bun run /Users/mayu/Projects/Agent/skills/insight-probe/tools/knowledge-graph-cli/src/cli/index.ts"
```

---

## 核心原则

- **ALWAYS** 从图谱推导搜索方向（`kg llm next-search-queries`），禁止预设模板
- **ALWAYS** 使用 `opencli web search <keyword>` 搜索
- **ALWAYS** 页面读取使用 `opencli web read --url "xxx"`
- **ALWAYS** 来源写入图谱：`echo '{...}' | kg source add --json-in - --dir <dir>`
- **ALWAYS** 搜索结果保存到 `{dir}/search_results/r{n}_q{m}_*.json`
- **NEVER** 让 CLI 直接调用 LLM — `kg llm *` 只输出任务信封，Agent 自身执行
- **NEVER** 使用 xueqiu 进行通用调研（仅限股票）
- **NEVER** 跳过 `kg graph lint` — 每轮结束时检查图谱质量

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
# → 输出：{ topic, dir, file }
# 记住 dir 路径，后续所有命令都用 --dir <dir>

# 创建任务
kg task create --title "调研任务" --goal "目标" --dir <dir>
```

---

## CONTINUE 路由：调研循环

### Step 1: 推导搜索方向

```bash
kg llm next-search-queries --task <taskId> --dir <dir>
# → 输出 LlmTaskEnvelope，包含 recommendedPrompt 和 graphContext
# Agent 用自身 LLM 执行后得到搜索词列表
```

**优先级**（当没有 next-search-queries 时）：
1. open Question → 直接作为查询
2. Gap 节点 → 按缺口类型扩展查询
3. 新实体 → 多维度查询

### Step 2: 搜索

```bash
opencli web search "{q}" --limit 8 -f json -o "{dir}/search_results/r{n}_q{m}_opencli.json"
opencli web search "{q_en}" --limit 8 -f json -o "{dir}/search_results/r{n}_q{m}_opencli_en.json"
```

### Step 3: URL 去重 + 写入来源

去重后按质量排序（wikipedia/arxiv/edu > reuters/bbc > zhihu/bilibili > blog/weibo），然后：

```bash
echo '{"title":"页面标题","uri":"https://...","sourceType":"webpage","attrs":{"author":"..."}}' | \
  kg source add --json-in - --dir <dir>
# → 输出 source 节点，记住 id
```

### Step 4: 抓取页面

```bash
opencli web read --url "{url}" --output "{dir}/pages" -f json
```

### Step 5: 提取（Agent LLM 执行）

```bash
# 获取提取任务信封
kg llm extract-entities --source <sourceId> --task <taskId> --dir <dir>
kg llm extract-claims --source <sourceId> --task <taskId> --dir <dir>

# Agent 用自身 LLM 按 recommendedPrompt 执行提取
# 将结果写回图谱：

# 写入实体
echo '{"kind":"Entity","type":"Person","title":"张三","attrs":{"aliases":[]}}' | \
  kg node upsert --json-in - --dir <dir>

# 写入断言
echo '{"kind":"Claim","text":"陈述内容","status":"proposed","attrs":{"claimType":"benchmark_result"}}' | \
  kg node upsert --json-in - --dir <dir>

# 写入证据
echo '{"kind":"Evidence","text":"原文片段","attrs":{"sourceId":"src_xxx"}}' | \
  kg node upsert --json-in - --dir <dir>

# 链接证据到断言
kg evidence link --evidence <evidenceId> --target <claimId> --role supports --dir <dir>

# 创建边关系
kg edge create --from <entityId> --type related_to --to <claimId> --dir <dir>
```

### Step 6: 规范化（每轮结束时）

```bash
# 实体去重
kg llm normalize-entities --task <taskId> --dir <dir>
# Agent 执行后合并重复实体

# 断言去重
kg llm normalize-claims --task <taskId> --dir <dir>
```

### Step 7: 生成问题 + 假设

```bash
kg llm generate-questions --task <taskId> --dir <dir>
# → 输出研究问题，写入 Question 节点

kg llm generate-hypotheses --task <taskId> --dir <dir>
# → 输出假设，写入 Hypothesis 节点
```

### Step 8: 检测缺口 + 评估证据

```bash
kg gap detect --dir <dir>
# → 输出知识缺口列表

kg llm assess-evidence --claim <claimId> --dir <dir>
# → 输出证据评估信封，Agent 执行后更新 claim 状态
```

### Step 9: 判断收敛

```bash
kg question list --status open --dir <dir>
kg graph stats --dir <dir>
```

- 有 open Question 且 ≤ 10 轮 → 继续
- 连续 2 轮 `kg graph stats` 无新节点 → 收敛
- 达到 10 轮 → 强制停止

---

## 命令速查

### 节点操作

```bash
kg node get <id> --dir <dir>
kg node list [--kind Entity|Claim|Source|Evidence|Question|Hypothesis|Gap] [--status open] --dir <dir>
kg node upsert --json-in <file|-> --dir <dir>
kg node delete <id> --dir <dir>
```

### 边操作

```bash
kg edge create --from <id> --type <relation> --to <id> [--confidence 0.8] --dir <dir>
kg edge get <id> --dir <dir>
kg edge list [--from <id>] [--type <relation>] --dir <dir>
kg edge delete <id> --dir <dir>
```

### 来源

```bash
echo '{"title":"标题","uri":"https://...","sourceType":"webpage"}' | kg source add --json-in - --dir <dir>
kg source get <id> --dir <dir>
```

### 证据

```bash
echo '{"sourceId":"src_xxx","snippet":"引用片段"}' | kg evidence add --json-in - --dir <dir>
kg evidence get <id> --dir <dir>
kg evidence link --evidence <evId> --target <claimId> --role supports|contradicts|mentions --dir <dir>
kg evidence list --target <claimId> --dir <dir>
```

### 断言

```bash
echo '{"text":"陈述","status":"proposed","attrs":{"claimType":"benchmark_result"}}' | kg node upsert --json-in - --dir <dir>
kg claim list [--status supported] [--task <taskId>] --dir <dir>
kg claim set-status <id> <status> --dir <dir>
# status: proposed | supported | weakly_supported | contested | contradicted | deprecated | superseded
kg claim conflicts <id> --dir <dir>
```

### 问题

```bash
echo '{"text":"问题","status":"open","attrs":{"priority":0.8}}' | kg node upsert --json-in - --dir <dir>
kg question list [--status open] --dir <dir>
```

### 图谱查询

```bash
kg graph neighbors <id> [--depth 2] --dir <dir>
kg graph subgraph [--focus <id>] [--depth 2] --dir <dir>
kg graph stats --dir <dir>
kg graph lint --dir <dir>
```

### 缺口检测

```bash
kg gap detect --dir <dir>
kg gap list --dir <dir>
```

### LLM 任务信封

```bash
kg llm extract-entities --source <id> [--task <taskId>] --dir <dir>
kg llm extract-observations --source <id> [--task <taskId>] --dir <dir>
kg llm extract-claims --source <id> [--task <taskId>] --dir <dir>
kg llm normalize-entities [--task <taskId>] --dir <dir>
kg llm normalize-claims [--task <taskId>] --dir <dir>
kg llm generate-questions [--task <taskId>] --dir <dir>
kg llm generate-hypotheses [--task <taskId>] --dir <dir>
kg llm next-search-queries [--task <taskId>] --dir <dir>
kg llm assess-evidence --claim <id> --dir <dir>
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

---

## 节点类型

| 类型 | kind | 说明 | 关键字段 |
|------|------|------|----------|
| 实体 | Entity | 客观对象 | type, title, attrs.aliases |
| 断言 | Claim | 可验证断言 | text, status, attrs.claimType, confidence |
| 来源 | Source | 原始来源 | title, attrs.uri, type |
| 证据 | Evidence | 来源中的片段 | text, attrs.sourceId |
| 观察 | Observation | 候选事实 | text, status |
| 问题 | Question | 待回答问题 | text, status, attrs.priority |
| 假设 | Hypothesis | 待验证假设 | text, status, confidence |
| 缺口 | Gap | 知识缺口 | text, attrs.gapType, attrs.severity |
| 任务 | Task | 调研任务 | title, goal, status |
| 数值 | Value | 数值 | text |

---

## Claim 状态流转

```
proposed → supported → deprecated
         → weakly_supported → contested → contradicted
                                    → superseded
```

---

## 可靠性评级

| 评级 | 来源 | 报告标注 |
|------|------|----------|
| 🟢 高 | 官方、权威媒体、百科、arXiv | `可靠性：🟢 高` |
| 🟡 中 | 行业分析、多方印证 | `可靠性：🟡 中` |
| 🔴 低 | 单一来源、未经证实 | `可靠性：🔴 低` |

---

## 搜索来源

### 默认方式

`opencli web search <keyword> --limit 8` — 自动使用所有适配器并发搜索

### 中文站点（需要 browser）

| 站点 | 命令 |
|------|------|
| 维基百科 | `opencli wikipedia search "{q}" --lang zh --limit 5` |
| 知乎 | `opencli zhihu search "{q}" --limit 5` |
| 小红书 | `opencli xiaohongshu search "{q}" --limit 5` |
| B站 | `opencli bilibili search "{q}" --limit 5` |

### 英文站点

| 站点 | 命令 |
|------|------|
| Wikipedia | `opencli wikipedia search "{q}" --lang en --limit 5` |
| HackerNews | `opencli hackernews search "{q}" --limit 5` |
| Reddit | `opencli reddit search "{q}" --limit 5` |
| ArXiv | `opencli arxiv search "{q}" --limit 5` |

### 来源选择

| 主题类型 | 优先来源 |
|----------|----------|
| 通用/中文 | `opencli web search` + 知乎/小红书/B站 |
| 技术/英文 | `opencli web search` + HN/Reddit/ArXiv |
| 财经/股票 | SearXNG + xueqiu |

---

## 产出体系

| 文件 | 生成方式 |
|------|----------|
| `final_report.md` | `kg graph subgraph` → 基于图谱生成报告 |
| `research_record.md` | 调研过程记录（Agent 维护） |
| `kg.json` | 图谱原始数据（CLI 自动维护） |

---

## 目录结构

```
temp/{topic}_{timestamp}/
├── kg.json            # 唯一真相来源（CLI 维护）
├── search_results/    # 搜索原始结果
└── pages/             # 抓取页面全文
```

---

## Checklist

- [ ] `opencli doctor` 检查连通性（首次使用 browser 站点）
- [ ] `kg new-topic` 创建目录，记住 `--dir` 路径
- [ ] 每个搜索结果写入 Source 节点
- [ ] 搜索结果保存到 `search_results/`
- [ ] 页面用 `opencli web read` 抓取
- [ ] 抓取后用 `kg llm extract-*` 获取任务信封
- [ ] Agent LLM 执行提取，结果写回图谱
- [ ] 每轮结束：`kg graph lint` + `kg gap detect`
- [ ] 报告每个发现标注可靠性等级

---

## 常见问题

| 症状 | 排查 |
|------|------|
| opencli 登录失败/cookie 过期 | 运行 `opencli <site> login` |
| `kg` 命令报错 Not found | 检查 `--dir` 路径是否正确 |
| 搜索返回空结果 | `browser: true` 站点需先 `opencli doctor` 检查 |
| `kg graph lint` 报孤立节点 | Question/Gap/Hypothesis/Source 节点本身不需要边连接，可忽略 |
| 调研收敛过快 | 检查 `kg question list --status open` 是否有未解决问题 |
| Claim 无证据支持 | `kg llm assess-evidence --claim <id>` 评估证据质量 |
| glob 匹配中文目录失败 | 用双引号而非单引号包裹模式：`glob "pages/**/*"` |
