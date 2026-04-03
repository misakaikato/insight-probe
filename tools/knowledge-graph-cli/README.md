# Knowledge Graph CLI (`kg`)

图谱驱动的迭代式深度调研工具。面向 LLM/Agent 调用设计，CLI 只做图谱操作与任务编排，不直接调用模型。

## 安装

```bash
bun install
```

## 快速开始

```bash
# 创建新调研主题
bun run kg new-topic "Gemma4评测"

# 所有后续命令通过 --dir 指定研究目录
DIR="./temp/Gemma4评测_1712130000000"

# 创建调研任务
bun run kg task create --title "Gemma4 评测调研" --goal "评估官方 benchmark 是否有独立证据支持" --dir $DIR

# 添加来源
echo '{"title":"Gemma 4 Technical Report","type":"webpage","attrs":{"uri":"https://example.com/gemma4-report","author":"Google"}}' | bun run kg node upsert --json-in - --dir $DIR

# 查看所有节点
bun run kg node list --dir $DIR
```

## 命令总览

### 基础图谱操作

```bash
# 节点
bun run kg node get <id> --dir <dir>
bun run kg node list [--kind Entity] [--status open] --dir <dir>
bun run kg node upsert --json-in data.json --dir <dir>
bun run kg node delete <id> --dir <dir>

# 边
bun run kg edge create --from ent_1 --type related_to --to ent_2 --dir <dir>
bun run kg edge get <id> --dir <dir>
bun run kg edge list [--from ent_1] [--type related_to] --dir <dir>
bun run kg edge delete <id> --dir <dir>
```

### 证据管理

```bash
# 添加来源
echo '{"title":"论文标题","type":"webpage"}' | bun run kg node upsert --json-in - --dir <dir>

# 查看来源
bun run kg source get <id> --dir <dir>

# 添加证据
echo '{"sourceId":"src_xxx","text":"原文引用片段","kind":"Evidence"}' | bun run kg node upsert --json-in - --dir <dir>

# 链接证据到 Claim
bun run kg evidence link --evidence ev_1 --target clm_1 --role supports --dir <dir>

# 查看某个目标的所有证据
bun run kg evidence list --target clm_1 --dir <dir>
```

### Claim 管理

```bash
# 创建 Claim
echo '{"text":"Gemma 4 31B 在 MMLU Pro 上达到 85.2%","status":"proposed","kind":"Claim"}' | bun run kg node upsert --json-in - --dir <dir>

# 更新状态
bun run kg claim set-status clm_1 supported --dir <dir>

# 查看冲突
bun run kg claim conflicts clm_1 --dir <dir>
```

### Question / Hypothesis

```bash
# 添加问题
echo '{"text":"是否有第三方独立评测？","status":"open","kind":"Question"}' | bun run kg node upsert --json-in - --dir <dir>

# 列出未解决问题
bun run kg node list --kind Question --status open --dir <dir>

# 添加假设
echo '{"text":"独立评测分数可能低于官方","status":"proposed","kind":"Hypothesis"}' | bun run kg node upsert --json-in - --dir <dir>
```

### 图谱查询

```bash
# 邻居遍历（BFS）
bun run kg graph neighbors ent_1 --depth 2 --dir <dir>

# 子图提取
bun run kg graph subgraph --focus ent_1 --depth 2 --dir <dir>

# 统计
bun run kg graph stats --dir <dir>

# 图谱检查
bun run kg graph lint --dir <dir>
```

### 缺口检测

```bash
# 自动检测知识缺口
bun run kg gap detect --dir <dir>

# 查看已检测到的缺口
bun run kg gap list --dir <dir>
```

### LLM 任务编排

所有 `llm` 命令不直接调用模型，只输出 JSON 格式的 `LlmTaskEnvelope`（含上下文、指令、推荐 prompt、输出 schema），由上层 Agent 执行。

```bash
# 从来源提取实体
bun run kg llm extract-entities --source src_1 --dir <dir>

# 从来源提取断言
bun run kg llm extract-claims --source src_1 --dir <dir>

# 生成新研究问题
bun run kg llm generate-questions --dir <dir>

# 生成下一轮搜索词
bun run kg llm next-search-queries --dir <dir>

# 评估证据质量
bun run kg llm assess-evidence --claim clm_1 --dir <dir>

# 实体/Claim 去重
bun run kg llm normalize-entities --dir <dir>
bun run kg llm normalize-claims --dir <dir>
```

## LLM 任务输出示例

```json
{
  "taskType": "extract_claims",
  "graphContext": {
    "focusNodeIds": ["src_1"],
    "relatedNodes": [...],
    "relatedEdges": [],
    "relatedEvidence": []
  },
  "inputContext": {
    "source": { "id": "src_1", "title": "..." },
    "existingClaims": [...]
  },
  "instructions": "Extract candidate factual claims...",
  "recommendedPrompt": "You are given a source...",
  "outputSchema": { "type": "object", "properties": { "claims": { "type": "array" } } },
  "executionHint": {
    "suggestedCommand": "kg node upsert --json-in claims.json"
  }
}
```

## 节点类型

| 类型 | 说明 | 关键字段 |
|------|------|----------|
| `Entity` | 客观对象（人/组织/概念/...） | type, title |
| `Claim` | 可验证断言 | text, status, confidence |
| `Source` | 原始来源 | title, attrs.uri |
| `Evidence` | 证据片段 | text, attrs.sourceId |
| `Observation` | 候选事实 | text, status |
| `Question` | 待回答问题 | text, status, attrs.priority |
| `Hypothesis` | 待验证假设 | text, status |
| `Gap` | 知识缺口 | text, attrs.gapType |
| `Task` | 调研任务 | title, goal, status |
| `Value` | 数值节点 | text |

## Claim 状态流转

```
proposed → supported → deprecated
         → weakly_supported → contested → contradicted
                                    → superseded
```

## 存储格式

每个研究目录包含一个 `kg.json` 文件，存储所有节点、边、证据链接和操作日志。

```
temp/{topic}_{timestamp}/
├── kg.json          # 唯一数据来源
├── search_results/  # 搜索原始结果（由上层 Agent 管理）
└── pages/           # 抓取页面全文（由上层 Agent 管理）
```

## 测试

```bash
bun test              # 单元测试
bun test tests/e2e/   # E2E 测试
```

## License

MIT
