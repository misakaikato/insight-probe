# Insight Probe

图谱驱动的迭代式深度调研工具。使用 SearXNG + opencli 多站并发搜索，知识图谱作为唯一真相来源动态推导每轮搜索方向。

## Features

- **知识图谱驱动**: 每一轮搜索方向由知识图谱中未回答的问题和新发现的实体决定
- **多源并发搜索**: 同时使用 SearXNG 和 opencli 进行多站点搜索
- **双语支持**: 中英文双语并发搜索，覆盖更多知识来源
- **动态关系发现**: 自动从内容中提取实体间的关系
- **知识版本追踪**: 保留知识更新历史，可追溯完整演变过程

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `bun run kg new-topic "主题"` | 创建新调研目录和图谱 |
| `bun run kg next <dir>` | 从图谱推导下一步搜索方向 |
| `bun run research <dir>` | 执行数据采集（搜索+抓取） |
| `bun run research <dir> --analyze` | 执行数据采集 + 自动分析 |
| `bun run kg analyze <dir> [--max <n>]` | 分析页面并提取知识 |
| `bun run kg stats <dir>` | 输出图谱统计摘要 |
| `bun run kg mermaid <dir>` | 导出 Mermaid 可视化 |
| `bun run kg image <dir>` | 导出 HTML 知识图谱图片 |
| `bun run kg report <dir>` | 生成最终综合报告 |
| `bun run kg knowledge-list <dir>` | 生成知识列表 |
| `bun run kg clean <dir>` | 清理过期文件 |
| `bun test` | 运行单元测试 |

### Route Table

| 用户意图 | 路由 | 操作 |
|----------|------|------|
| 开始新调研 | NEW_TOPIC | 创建目录结构 + 初始化图谱 |
| 继续调研 | CONTINUE | 读取图谱 → 推导下一步 → 执行搜索 |
| 查看进度 | STATS | 输出图谱统计摘要 |
| 导出可视化 | MERMAID | 生成 Mermaid 图 |
| 导出图片 | IMAGE | 生成 HTML 知识图谱 |
| 清理临时文件 | CLEAN | 删除过期文件 |

## Architecture

```
temp/{topic}_{timestamp}/
├── knowledge_graph.json    # 图谱（唯一的真相来源）
├── search_results/         # 搜索原始结果
├── pages/                  # 抓取页面全文
└── reports/               # 最终报告
```

## Output

调研完成后生成以下文件：

| File | Description |
|------|-------------|
| `final_report.md` | 最终综合报告 |
| `research_record.md` | 调研记录（按轮次） |
| `knowledge_list.md` | 知识列表 |
| `knowledge_graph.html` | 知识图谱可视化 |
| `knowledge_graph.json` | 原始图谱数据 |

## Requirements

- Bun
- SearXNG (running at http://127.0.0.1:10086)
- opencli

## Install

```bash
# 安装依赖
bun install

# 运行测试
bun test
```

## License

MIT
