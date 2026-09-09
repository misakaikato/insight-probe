# Insight Probe

图谱驱动的迭代式深度调研工具。使用知识图谱 CLI (`kg`) 作为唯一真相来源，LLM 负责理解和生成，CLI 负责存储和编排。

## 数据模型

- **4 种节点**：Entity（实体）、Source（来源）、Evidence（证据）、Proposition（命题）
- **10 种边类型**：related_to, evidence_link, derived_from, contradicts, supports, supersedes, answers, raised_by, predicts, sourced_from
- **命题生命周期**：12 种 status（unrefined → open → hypothesized → asserted → evaluating → supported/weakly_supported/contested/contradicted/superseded/resolved/obsolete）
- **缺口检测**：纯计算返回 GapResult，不存储为节点

## Features

- **知识图谱驱动**: 每一轮搜索方向由知识图谱中未回答的命题和新发现的实体决定
- **多源并发搜索**: 同时使用 SearXNG 和 opencli 进行多站点搜索
- **双语支持**: 中英文双语并发搜索，覆盖更多知识来源
- **动态关系发现**: 自动从内容中提取实体间的关系
- **知识版本追踪**: 保留知识更新历史，可追溯完整演变过程
- **数据迁移**: 自动将旧版 kg.json（kind 字段）迁移为新版（type 字段）

## Usage

### 安装

```bash
cd tools/knowledge-graph-cli
bun install
bun run build
bun link  # 可选，全局安装为 kg 命令
```

### 核心命令

```bash
# 创建新调研
kg new-topic "主题"

# 节点操作（4 种类型：Entity, Source, Evidence, Proposition）
kg node upsert --json-in <file> --dir <dir>
kg node list --kind Proposition --status open --dir <dir>
kg node set-status <id> supported --dir <dir>
kg node merge <id1> <id2> --dir <dir>

# 证据链接（创建 evidence_link 类型的边）
kg evidence add --json-in <file> --dir <dir>
kg evidence link --evidence <id> --target <id> --role supports --dir <dir>

# 图谱分析
kg graph stats --dir <dir>
kg graph lint --dir <dir>
kg graph gaps --detect --dir <dir>

# LLM 任务信封（不直接调用 LLM）
kg llm extract-entities --source <id> --dir <dir>
kg llm extract-claims --source <id> --dir <dir>
kg llm generate-report --topic "主题" --dir <dir>
```

### Route Table

| 用户意图 | 路由 | 操作 |
|----------|------|------|
| 开始新调研 | NEW_TOPIC | 创建目录结构 + 初始化图谱 |
| 继续调研 | CONTINUE | 推导搜索方向 → 搜索 → 抓取 → 提取 → 写回图谱 |
| 查看进度 | STATS | `kg graph stats --dir <dir>` |
| 检测缺口 | GAPS | `kg graph gaps --detect --dir <dir>` |
| 生成报告 | REPORT | `kg llm generate-report` → LLM 生成 |

## Architecture

```
temp/{topic}_{timestamp}/
├── kg.json              # 图谱（唯一的真相来源）
├── search_results/      # 搜索原始结果
├── pages/               # 抓取页面全文
└── tasks/
    └── {taskId}/
        └── tasks.md     # 外置流程记忆 / checklist
```

## Output

| File | Description |
|------|-------------|
| `final_report.md` | 最终综合报告（LLM 生成或程序化） |
| `research_record.md` | 调研记录（按轮次） |
| `kg.json` | 知识图谱原始数据 |

## Requirements

- Bun
- opencli（搜索 + 页面读取）
- SearXNG（可选，运行于 http://127.0.0.1:10086）

## Testing

```bash
cd tools/knowledge-graph-cli
bun run test        # 单元测试
bun run test:e2e    # E2E 测试
```

## License

MIT

---

## Consulting & Engineering · 咨询与工程交付

**EN** — Taking on a small number of engagements, from a scoped advisory review to a full delivery embedded in your team.

- **LLM and RL systems** — model selection and evaluation, training and fine-tuning pipelines, reward design and policy training, and the measurement that decides whether a result holds: perturbation audits, replication, effect sizes instead of anecdotes.
- **Agents you run yourself** — agent systems deployed on your own hardware or inside your VPC. Local inference on Apple Silicon (MLX) and on GPU servers, tool and MCP integration, call recording and replay, budget and failure accounting.
- **Forward-deployed engineering (FDE)** — embedded with your team for a defined term, carrying a problem from the first conversation to something running in your production, then handing over the code, the tests and the documentation.

**中文** — 只承接少量合作，从一次限定范围的方案评审，到嵌入团队的完整交付。

- **LLM 与强化学习算法咨询** — 模型选型与评测、训练与微调流水线、奖励设计与策略训练，以及决定结论能否成立的那部分工作：扰动审计、重复实验、用效应量而不是个案说话。
- **本地与私有化 Agent 部署** — 在你自己的机器或 VPC 里落地的 agent 系统。Apple Silicon（MLX）与 GPU 服务器上的本地推理、工具与 MCP 接入、调用录制与回放、预算与失败核算。
- **驻场交付工程（FDE）** — 以明确周期嵌入你的团队，把一个问题从第一次对话推到在你的生产环境里跑起来，并交付代码、测试与文档。

Contact · 联系方式：[misakaikato@outlook.com](mailto:misakaikato@outlook.com)
