# 研究流程详解

## 概述

```
┌─────────────────────────────────────────────────────────────────┐
│  阶段 1: 数据采集（research-runner.ts）                          │
│  搜索 → 抓取 → 保存原始页面                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  阶段 2: 分析                                                      │
│  读取页面 → 提取 findings/entities/relations → 更新图谱            │
└─────────────────────────────────────────────────────────────────┘
```

**数据采集** (`research-runner.ts`): 只负责搜索和抓取，不做分析
**分析**: 从页面中提取结构化知识

---

## 阶段 1: 数据采集

运行 `bun run research-runner.ts run <topic_dir>` 或 `bun run research-runner.ts run <topic_dir> --analyze`

```
research-runner.ts:
├── 推导搜索方向（从图谱 deriveNextQueries）
├── 并发搜索（SearXNG + opencli 多站）
├── URL 去重 + 质量评分
├── 抓取页面（opencli web read / curl fallback）
├── 生成 pages_manifest.json
└── [--analyze] 自动分析页面并更新图谱
```

**`--analyze` 标志**：采集完成后自动分析前5页内容并更新图谱，无需手动运行 `kg analyze`

**页面质量评分**（URL 选择依据）：

| 分数 | 来源示例 |
|------|----------|
| 0.9+ | wikipedia.org, arxiv.org, nih.gov, edu, gov |
| 0.7-0.8 | worldjournal.com, bbc.com, reuters.com |
| 0.5-0.6 | zhihu.com, bilibili.com |
| < 0.5 | blog, weibo.com |

---

## 阶段 2: 分析

读取 `pages_manifest.json` 中记录的页面文件，逐页分析：

### Step 1: 推导搜索方向

调用 `deriveNextQueries(maxQueries, round)`：

- **优先级 1**: 未回答的 question（直接作为查询）
- **优先级 2**: 从 finding 的 `metadata.entities` 提取实体
- **去重**: 对照已有 `search_query` 的 `label` 和 `query` 字段

**实体类型感知查询扩展**：

| 实体类型 | 查询模板示例 |
|----------|-------------|
| 人物 | `{e} 生平简介`, `{e} 代表作品/成就`, `{e} 历史地位与影响` |
| 组织 | `{e} 组织历史沿革`, `{e} 核心成员/创始人`, `{e} 重要事件/里程碑` |
| 概念 | `{e} 理论背景与来源`, `{e} 核心内容与定义`, `{e} 批判性评价` |
| 地点 | `{e} 历史沿革`, `{e} 文化特色`, `{e} 重要事件/名人` |
| 事件 | `{e} 发生背景`, `{e} 主要经过`, `{e} 各方反应`, `{e} 历史影响` |

### Step 2: 搜索执行

```bash
# === SearXNG 多语言搜索 ===
curl -s "http://127.0.0.1:10086/search?q={q}&format=json&engines=google,bing,wikipedia,wikidata,duckduckgo,yandex&categories=general,news,science,web" \
  -o "{topic_dir}/search_results/r{n}_q{m}_searxng.json"

# === opencli 中文站点（并行）===
opencli wikipedia search "{q}" --lang zh --limit 8 -f json
opencli zhihu search "{q}" --limit 8 -f json
opencli weibo search "{q}" --limit 8 -f json
opencli bilibili search "{q}" --limit 8 -f json
opencli xiaohongshu search "{q}" --limit 8 -f json
opencli douban search "{q}" --type movie --limit 5 -f json
opencli douban search "{q}" --type book --limit 5 -f json

# === opencli 英文站点（并行）===
opencli wikipedia search "{q_en}" --lang en --limit 8 -f json
opencli hackernews search "{q_en}" --limit 8 -f json
opencli reddit search "{q_en}" --limit 8 -f json
opencli arxiv search "{q_en}" --limit 8 -f json
opencli stackoverflow search "{q_en}" --limit 8 -f json
opencli v2ex hot -f json  # V2EX 热门话题
```

**搜索站点映射**：

| 语言 | 站点 |
|------|------|
| 中文 (zh) | wikipedia (zh), 知乎, 微博, B站, 小红书, 豆瓣 |
| 英文 (en) | wikipedia (en), Hacker News, Reddit, arXiv, StackOverflow, V2EX hot |

**多语言查询生成示例**：

| 原始查询 | 中文变体 | 英文变体 |
|----------|----------|----------|
| 卡巴拉 | 卡巴拉是什么 | Kabbalah overview |
| Merkabah 修炼 | Merkabah 神秘主义 | Merkabah mysticism practice |
| 卢里亚 破器 | 卢里亚 卡巴拉 | Isaac Luria Kabbalah breaking vessels |

### Step 3: URL 合并择优

1. 读取所有来源结果 JSON
2. 按 URL 去重
3. 按域名权重评分，选取 top 页面

### Step 4: 抓取页面

**优先使用 `opencli web read`**（支持 JS 渲染、内容提取、去噪）：

```bash
# 标准方式：opencli web read
opencli web read --url "{url}" --output "{topic_dir}/pages" -f json

# 输出文件：{topic_dir}/pages/{标题}/{标题}.md
```

**内容质量检查**：
- 抓取后检查文件大小，< 500 字节视为失败
- 失败时 fallback 到 curl：
  ```bash
  curl -sL -A "InsightProbe/1.0" -m 30 "{url}" > "{topic_dir}/pages/{filename}.txt"
  ```

| 站点类型 | 优先方式 | 说明 |
|----------|----------|------|
| 任意页面 | `opencli web read` | 支持 JS 渲染，输出干净 Markdown |
| opencli 有专用命令 | `opencli <site> <cmd> <id>` | 如知乎、微信公众号等 |
| opencli web read 失败 | `curl` | 最后 fallback |

### Step 5: 分析页面内容

**执行方式**：运行 `bun run kg analyze <topic_dir> [--max <n>]`

读取页面文件并提取：

1. **显性知识**（必须有直接证据）
   - 知识点（Findings）：3-5 个陈述性知识
   - 命名实体（Entities）：人物、地点、组织、事件、概念等
   - 关系（Relations）：实体之间的关系

2. **图谱补全**（主动推理）
   - **推断实体**（hypothetical_entities）：基于上下文推断可能存在但未提及的实体
   - **推断关系**（hypothetical_relations）：基于已知实体推断可能存在的关系
   - **知识空白**（knowledge_gaps）：识别当前主题中的盲区
   - **探索建议**（suggested_explorations）：基于空白提出值得调研的方向

**执行方式**：读取 Markdown 文件 → 使用规则分析提取知识 → 将结果添加到图谱

**自动分析**：使用 `bun run research <topic_dir> --analyze` 可在采集完成后自动执行此步骤

### Step 6: 更新图谱

| 操作 | 添加节点 |
|------|----------|
| 搜索完成 | `search_query`（含 `sources` 数组） |
| 选中页面 | `webpage` |
| 阅读内容 | `finding`（含 `metadata.entities`） |
| 发现疑问 | `question`（`status: unanswered`） |
| 推断实体 | `entity`（`status: hypothetical`） |
| 推断关系 | `relation`（`status: hypothetical`） |
| 知识空白 | `question`（`status: unanswered`, `type: gap`） |
| 探索建议 | `question`（`status: unanswered`, `type: exploration`） |

### Step 7: 判断继续

- 有 `unanswered` question → 继续下一轮
- 连续 3 轮无新 finding → 收敛
- 达到 10 轮 → 强制停止

---

## 生成报告

从图谱提取所有 `finding` 节点，生成两份文档：

**1. 调研报告** (`{topic}_report.md`)：
```markdown
# {主题} 深度调研报告

## 执行摘要
{一句话概括主题的核心发现}

## 核心发现
### 1. {标题}
{内容}
> 来源：{来源名称} | 可靠性：high/medium/low

### 2. {标题}
...

## 调研过程
### 第 1 轮
- 搜索关键词：{query1}, {query2}
- 抓取页面：{n} 个
- 新发现：{finding1}, {finding2}

### 第 2 轮
...

## 未解答问题
1. {unanswered question}
```

**2. 知识列表** (`{topic}_knowledge_list.md`)：
```markdown
# {主题} 知识列表

| # | 知识点 | 类别 | 来源 | URL |
|---|--------|------|------|-----|
| 1 | {知识点} | {人物/事件/地点/概念} | {来源名} | {url} |
| 2 | ... | ... | ... | ... |

## 类别统计
- 人物：{n} 个
- 事件：{n} 个
- 地点：{n} 个
- 概念：{n} 个
```
