---
name: insight-probe
description: 深度调研工具
trigger: 调研, 研究, 深入了解, 深度调研, deep research, investigate, 探究, probe, insight
do_not_trigger: 简单搜索, 单一问题, 纯编码
license: MIT
metadata:
  version: "2.5.0"
  category: research
  searxng:
    endpoint: http://127.0.0.1:10086
    timeout: 30000
    engines: [google, bing, wikipedia, wikidata, duckduckgo, yandex]
    safe_search: 0
    categories: [general, news, science, web]
  research:
    max_rounds: 5
    queries_per_round: 4
    iteration_delay_ms: 1000
    stop_on_no_new_findings: 2
  storage:
    temp_dir: ./temp
    max_file_age_hours: 24
  crawler:
    max_pages_per_round: 10
    timeout: 30000
    quality_threshold: 0.6
---

# Insight Probe

图谱驱动的迭代式深度调研工具。每一轮搜索方向由知识图谱动态推导，而非预设模板。

---

## Quick Start

直接对 Agent 说：

```
帮我调研一下史前大洪水
研究一下卡巴拉神秘主义的起源
深度调研 Rust 在嵌入式领域的应用
```

Agent 会自动创建调研项目，并发搜索多个来源，迭代深入直到收敛。

---

## 前置依赖

使用前请确保以下服务已就绪：

| 依赖 | 检查命令 | 说明 |
|------|----------|------|
| Bun | `bun --version` | 运行工具脚本 |
| SearXNG | `curl http://127.0.0.1:10086` | 本地聚合搜索引擎 |
| opencli | `opencli doctor` | 多站点搜索 + 页面读取 |

> 如果 `opencli doctor` 报某个站点登录失败或 cookie 过期，运行 `opencli <site> login` 重新登录后重试。

---

## Route Table

| 用户意图 | 路由 | 操作 |
|----------|------|------|
| 开始新调研 | NEW_TOPIC | 创建目录 + 初始化图谱 |
| 继续调研 | CONTINUE | 读取图谱 → AI 推导下一步 → 执行搜索 |
| 查看进度 | STATS | 输出图谱统计摘要 |
| 导出可视化 | MERMAID | 生成 Mermaid 图 |
| 导出图片 | IMAGE | 生成 HTML 知识图谱 |
| 清理临时文件 | CLEAN | 删除 >24h 过期文件 |

---

## Quick Reference

| 操作 | 命令 |
|------|------|
| 创建调研 | `bun run kg new-topic "主题"` |
| 推导方向 | `bun run kg next <dir>` |
| 执行采集 | `bun run research <dir>` |
| 准备分析 | `bun run kg analyze <dir>` | 列出待分析页面，Agent 执行分析 |
| 查看统计 | `bun run kg stats <dir>` |
| 导出 Mermaid | `bun run kg mermaid <dir>` |
| 导出图片 | `bun run kg image <dir>` |
| 生成报告 | `bun run kg report <dir>` |
| 生成记录 | `bun run kg research-record <dir>` |
| 生成知识列表 | `bun run kg knowledge-list <dir>` |
| 清理过期文件 | `bun run kg clean <dir>` |

---

## Core Principles

- **ALWAYS** 从图谱推导搜索方向，禁止使用预设模板
- **ALWAYS** 每轮搜索使用 `opencli web search <keyword> --limit <n>` 搜索所有适配器
- **ALWAYS** 搜索结果保存到 `{topic_dir}/search_results/r{n}_q{m}_opencli.json`
- **ALWAYS** 不同来源的同一 URL 必须去重，合并后择优抓取
- **ALWAYS** 在 `search_query` 节点的 `sources` 字段记录所有使用的来源
- **ALWAYS** 所有页面读取统一使用 `opencli web read --url "xxx"`，不要用 curl 抓取
- **NEVER** 直接复用已有 query 节点的相同文本（检查 `label` 和 `query` 字段）
- **NEVER** 在 `browser: true` 站点未经 `opencli doctor` 检查连通性就直接使用
- **NEVER** 使用 xueqiu 进行通用主题调研（仅限股票）
- **NEVER** 使用 curl 直接抓取页面（统一使用 `opencli web read`）
- **ALWAYS** 当 `opencli doctor` 或搜索/读取操作返回登录失败、cookie 过期等错误时，**立即告知用户**检查该站点是否需要登录，并提示运行 `opencli <site> login`

---

## 目录结构

```
temp/{topic}_{timestamp}/
├── knowledge_graph.json    # 图谱（唯一的真相来源）
├── search_results/         # 搜索原始结果
├── pages/                  # 抓取页面全文
└── reports/               # 最终报告
```

---

## 调研流程

详见 [references/research-flow.md](references/research-flow.md)

---

## Anti-Patterns

- ❌ 使用预设模板生成搜索关键词 → ✅ 从图谱 AI 动态推导
- ❌ 使用分散的搜索命令 → ✅ 统一用 `opencli web search`
- ❌ 不记录 `sources` 字段 → ✅ 每次搜索必须记录来源数组
- ❌ 同一 URL 重复抓取 → ✅ 不同来源先去重再抓取
- ❌ 雪球用于通用调研 → ✅ 仅限股票相关
- ❌ 用 curl 抓取页面 → ✅ 统一用 `opencli web read --url "xxx"`

---

## Checklist

- [ ] `opencli doctor` 检查各站点连通性
- [ ] 每轮搜索后更新 `knowledge_graph.json`
- [ ] `search_query` 节点包含完整的 `sources` 数组
- [ ] 搜索使用中英文双语并发
- [ ] 页面读取统一使用 `opencli web read`
- [ ] 页面分析由 Agent 完成（使用 `references/prompts.md` 中的分析框架）
- [ ] 收敛判断：有 `unanswered` question 才继续
- [ ] 最终报告包含可靠性评级和事实引用来源

---

## Agent 分析循环

**这是 Agent 使用自己的 LLM 进行分析的完整流程：**

### 流程概览

```
research 采集页面 → kg analyze 查看待分析页面 → Agent 读取页面 → Agent 用自己的 LLM 分析 → 添加到图谱
```

### 具体步骤

**Step 1: 运行 `bun run kg analyze <dir>` 查看待分析页面**

```
bun run kg analyze /path/to/topic
```

输出会列出所有待分析的页面文件路径。

**Step 2: Agent 读取页面文件并用自己 LLM 分析**

对每个页面文件，Agent 调用自己的 LLM 进行分析，使用的 prompt 框架见 `references/prompts.md`。

分析后输出 JSON 格式的 findings。

**Step 3: 将 findings 添加到图谱**

```bash
# 将分析结果的 JSON 通过管道传给 kg add-findings
echo '[{"label": "发现内容", "source_nodes": ["webpage_001"], "metadata": {"entities": ["实体1"], "reliability": "high"}}]' \
  | bun run kg:add-findings /path/to/topic
```

或者一次性添加多条：

```bash
# 分析多个页面后，将所有 findings 合并添加
cat << 'EOF' | bun run kg:add-findings /path/to/topic
[
  {"label": "发现1", "source_nodes": ["webpage_001"], "metadata": {"entities": ["实体A"], "reliability": "high"}},
  {"label": "发现2", "source_nodes": ["webpage_002"], "metadata": {"entities": ["实体B"], "reliability": "medium"}}
]
EOF
```

### 分析输出格式

参考 `references/prompts.md` 中的完整格式，核心输出：

```json
{
  "findings": [
    {"fact": "事实陈述", "category": "事件|概念|人物|地点", "significance": "重要性"}
  ],
  "entities": [
    {"name": "实体名", "type": "人物|地点|组织|事件|概念", "description": "描述"}
  ],
  "relations": [
    {"from": "实体A", "to": "实体B", "relation": "关系类型"}
  ],
  "followup_questions": ["后续问题1", "后续问题2"]
}
```

### 注意事项

- **不要调用任何外部 API** 进行分析，只用 Agent 自身的 LLM 能力
- **每个页面都要分析**，不要遗漏
- **分析要深入**，不只是表面信息，要主动发现关联和空白
- **发现新实体**时，在 `metadata.entities` 中记录
- **有新问题**时，通过 `followup_questions` 字段提出

---

## 产出体系

调研完成后，在 `{topic_dir}/reports/` 目录生成：

| 文件 | 说明 |
|------|------|
| `final_report.md` | 最终综合报告（核心发现 + 事实引用来源） |
| `research_record.md` | 调研记录（按轮次过程） |
| `knowledge_list.md` | 猱识列表（按类别整理） |
| `knowledge_graph.html` | 猱识图谱可视化（交互式力导向图） |
| `knowledge_graph.json` | 原始图谱数据 |

---

## References

- [research-flow.md](references/research-flow.md) — 详细调研流程
- [prompts.md](references/prompts.md) — 分析 Prompt 模板
- [search-sources.md](references/search-sources.md) — opencli 站点配置
- [reliability.md](references/reliability.md) — 可靠性评级标准
- [troubleshooting.md](references/troubleshooting.md) — 常见问题排查
