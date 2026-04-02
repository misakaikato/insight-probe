---
name: insight-probe
description: |
  图谱驱动的迭代式深度调研工具。使用 SearXNG + opencli 多站并发搜索，知识图谱作为唯一真相来源动态推导每轮搜索方向。
  Use when: 用户需要进行深度调研、背景研究、多来源信息收集、竞争分析
  Trigger: /probe, /insight, 调研, 研究, 深度调研, deep research, investigate
  DO NOT TRIGGER when: 仅需要简单搜索而非深度研究、纯技术编码问题
license: MIT
metadata:
  version: "2.4.0"
  category: research
  sources:
    - SearXNG (本地聚合搜索)
    - opencli (多站点 CLI)
    - 知识图谱 (knowledge-graph.ts)
  searxng:
    endpoint: http://127.0.0.1:10086
    timeout: 30000
    engines: [google, bing, wikipedia, wikidata, duckduckgo, yandex]
    safe_search: 0
    categories: [general, news, science, web]
  search:
    # 多语言搜索配置
    languages: [zh, en]  # 中文、英文
    # 每个查询生成的语言变体数量
    variants_per_query: 2
    # 查询扩展模板（用于从实体生成多语言查询）
    query_templates:
      zh:
        - "{entity}"
        - "{entity} 是什么"
        - "{entity} 详解"
        - "{entity} 历史 起源"
      en:
        - "{entity}"
        - "{entity} overview"
        - "{entity} history origin"
        - "{entity} detailed explanation"
  opencli:
    timeout: 30000
    max_concurrent: 10
    format: json
    # 多语言搜索站点配置
    sites:
      zh:
        - wikipedia      # 中文维基
        - zhihu
        - weibo
        - bilibili
        - xiaohongshu     # 小红书
        - douban          # 豆瓣（电影+图书）
      en:
        - wikipedia_en    # 英文维基
        - hackernews
        - reddit
        - arxiv
        - stackoverflow
        - v2ex            # 用 hot 命令
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

图谱驱动的迭代式深度调研。每一轮搜索方向由知识图谱中未回答的问题和新发现的实体决定，而非预设模板。

---

## Route Table

| 用户意图 | 路由 | 操作 |
|----------|------|------|
| 开始新调研 | NEW_TOPIC | 创建目录结构 + 初始化图谱 |
| 继续调研 | CONTINUE | 读取图谱 → 推导下一步 → 执行搜索 |
| 查看进度 | STATS | 输出图谱统计摘要 |
| 导出可视化 | MERMAID | 生成 Mermaid 图 |
| 导出图片 | IMAGE | 生成美观 HTML 知识图谱 |
| 清理临时文件 | CLEAN | 删除 >24h 过期文件 |

---

## Quick Reference

| 操作 | 命令 |
|------|------|
| 创建调研 | `bun run kg new-topic "主题"` |
| 继续调研 | `bun run kg next <topic_dir>` |
| 执行调研 | `bun run research <topic_dir> [--analyze]` |
| 分析页面 | `bun run kg analyze <topic_dir> [--max <n>]` |
| 查看统计 | `bun run kg stats <topic_dir>` |
| 导出图谱 | `bun run kg mermaid <topic_dir>` |
| 导出图片 | `bun run kg image <topic_dir>` |
| 导出知识列表 | `bun run kg knowledge-list <topic_dir> [--output <file>]` |
| 清理过期 | `bun run kg clean <topic_dir>` |

---

## Core Principles

- **ALWAYS** 从图谱推导搜索方向，禁止使用预设模板
- **ALWAYS** 并发执行 SearXNG + 所有 opencli 站点搜索
- **ALWAYS** 搜索结果保存到 `{topic_dir}/search_results/r{n}_q{m}_{source}.json`
- **ALWAYS** 不同来源的同一 URL 必须去重，合并后择优抓取
- **ALWAYS** 在 `search_query` 节点的 `sources` 字段记录所有使用的来源
- **NEVER** 直接复用已有 query 节点的相同文本（检查 `label` 和 `query` 字段）
- **NEVER** 在 `browser: true` 站点未经 `opencli doctor` 检查连通性就直接使用
- **NEVER** 使用 xueqiu 进行通用主题调研（仅限股票）

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

- ❌ 使用预设模板生成搜索关键词 → ✅ 从图谱 `deriveNextQueries` 动态推导
- ❌ 仅用 SearXNG 不开 opencli → ✅ 必须并发所有来源
- ❌ 仅搜索单一语言 → ✅ 中英文双语并发搜索
- ❌ 不记录 `sources` 字段 → ✅ 每次搜索必须记录来源数组
- ❌ 同一 URL 重复抓取 → ✅ 不同来源先去重再抓取
- ❌ V2EX 用 `search` 命令 → ✅ 用 `opencli v2ex hot`
- ❌ 雪球用于通用调研 → ✅ 仅限股票相关
- ❌ 用 emoji 作为状态标识 → ✅ 用文字 `unanswered`/`answered`
- ❌ 用 curl 抓取动态页面 → ✅ 用 `opencli web read`（支持 JS 渲染）

---

## Checklist

- [ ] 确认 SearXNG 服务运行中（`curl http://127.0.0.1:10086`）
- [ ] `browser: true` 站点已通过 `opencli doctor` 检查
- [ ] 每轮搜索后更新 `knowledge_graph.json`
- [ ] `search_query` 节点包含完整的 `sources` 数组
- [ ] 搜索使用中英文双语（zh + en）并发
- [ ] 发现新实体后添加到 finding 的 `metadata.entities`
- [ ] 不同来源相同 URL 已去重
- [ ] 页面抓取使用 `opencli web read`（支持 JS 渲染 + 内容去噪）
- [ ] 收敛判断：有 `unanswered` question 才继续
- [ ] 最终报告包含可靠性评级

---

## kg 工具命令

| 命令 | 说明 |
|------|------|
| `bun run kg new-topic "主题"` | 创建新调研目录和图谱 |
| `bun run kg next <dir>` | 从图谱推导下一步搜索方向 |
| `bun run research <dir>` | 执行数据采集（搜索+抓取），生成 pages_manifest.json |
| `bun run research <dir> --analyze` | 执行数据采集 + 自动分析（采集后立即分析页面） |
| `bun run kg analyze <dir> [--max <n>]` | 分析页面并提取知识（默认分析前5页） |
| `bun run kg stats <dir>` | 输出图谱统计摘要 |
| `bun run kg mermaid <dir>` | 导出 Mermaid 可视化 |
| `bun run kg image <dir>` | 导出美观 HTML 知识图谱图片 |
| `bun run kg report <dir>` | 生成最终综合报告 |
| `bun run kg research-record <dir>` | 生成调研过程记录 |
| `bun run kg knowledge-list <dir>` | 生成知识列表 |
| `bun run kg clean <dir>` | 清理 >24h 过期文件 |
| `bun test` | 运行单元测试（37 tests） |

**注意**: `kg next` 仅推导搜索方向，不执行搜索。实际搜索和抓取由 `research` 命令完成。

---

## 产出体系

调研完成后，会在 `{topic_dir}/reports/` 目录下生成以下文件：

| 文件 | 说明 |
|------|------|
| `final_report.md` | 最终综合报告（核心发现、实体关系、调研过程） |
| `research_record.md` | 调研记录（按轮次的过程记录） |
| `knowledge_list.md` | 知识列表（按类别整理的知识条目） |
| `knowledge_graph.html` | 知识图谱可视化（交互式力导向图） |
| `knowledge_graph.json` | 原始图谱数据（节点、边、动态关系） |

---

## 动态关系发现

知识图谱支持从内容中**自动发现实体关系**：

1. 在分析页面时，提取实体之间的关系
2. 这些关系存储在 `dynamicRelations` 数组中
3. 关系不限于预定义类型，可自由发现任意关系
4. 关系可追溯来源

**关系结构**：
```typescript
{
  from: "实体A",
  to: "实体B",
  relation: "关系类型",
  source: "来源描述"
}
```

---

## 知识版本追踪

当已有知识被更新时，系统会保留历史版本：

1. 每次更新会创建新版本号
2. 历史版本保存在 `versionHistory` 中
3. 可以查看知识的完整演变过程

---

## References

详细文档见 `references/` 目录：

- [research-flow.md](references/research-flow.md) — 详细调研流程
- [prompts.md](references/prompts.md) — 分析 Prompt 模板
- [search-sources.md](references/search-sources.md) — opencli 站点完整配置与命令
- [reliability.md](references/reliability.md) — 可靠性评级标准
- [troubleshooting.md](references/troubleshooting.md) — 常见问题排查

代码工具：`tools/knowledge-graph.ts`
