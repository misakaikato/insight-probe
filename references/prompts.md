# 分析 Prompt 模板

## 页面分析 Prompt

```markdown
你是一个知识提取专家。从以下页面内容中提取结构化信息，同时主动发现知识图谱中的空白。

## 页面标题
{title}

## 页面 URL
{url}

## 页面内容
{content}

## 提取要求

请提取以下信息，输出 JSON 格式：

{
  "findings": [
    {
      "fact": "陈述性知识内容（30-200字）",
      "category": "事实|事件|概念|地点|人物",
      "significance": "为什么这个知识重要（1句话）"
    }
  ],
  "entities": [
    {
      "name": "实体名称",
      "type": "人物|地点|组织|事件|概念|作品",
      "description": "简要描述（1-2句话）"
    }
  ],
  "relations": [
    {
      "from": "实体A",
      "to": "实体B",
      "relation": "关系类型"
    }
  ],
  "followup_questions": [
    "值得深入调研的问题1",
    "值得深入调研的问题2"
  ],
  "hypothetical_entities": [
    {
      "name": "可能存在但未明确提及的实体",
      "type": "人物|地点|组织|事件|概念|作品",
      "reasoning": "为什么推断这个实体可能存在（基于上下文、领域知识、关联概念）"
    }
  ],
  "hypothetical_relations": [
    {
      "from": "已知实体A",
      "to": "已知实体B",
      "relation": "可能存在的关系类型",
      "reasoning": "为什么推断这种关系可能存在"
    }
  ],
  "knowledge_gaps": [
    {
      "aspect": "知识盲区/空白点描述",
      "importance": "补全这个空白为什么重要"
    }
  ],
  "suggested_explorations": [
    {
      "direction": "建议探索的方向",
      "rationale": "为什么这个方向值得探索"
    }
  ]
}

## 提取原则

### 1. 显性知识提取
- 只提取页面中**明确提到**的信息
- findings、entities、relations 必须有直接证据

### 2. 知识图谱补全（主动推理）
- **hypothetical_entities**: 基于上下文推断可能存在但未提及的实体
  - 例：文章提到"张三师从李四"，可推断存在"张三"和"李四"的师徒关系
  - 例：提到某个组织，可推断可能存在创始人、总部地点等实体
- **hypothetical_relations**: 基于已知实体推断可能存在的关系
  - 例：同时提到"甲公司"和"乙公司"，可推断可能存在"竞争"、"合作"等关系
  - 例：提到历史人物和历史事件，可推断"参与"、"导致"等关系
- **knowledge_gaps**: 识别当前页面/主题中的知识空白
  - 例：提到某技术的优点，但没提到局限性
  - 例：提到某事件的过程，但没提到各方反应
- **suggested_explorations**: 基于发现的空白，提出值得下一步调研的方向
  - 例：某概念定义模糊 → 建议调研其精确定义
  - 例：某事件影响不明 → 建议调研其历史影响

### 3. 注意事项
- 实体类型必须使用指定的值之一
- 如果某项没有相关信息，输出空数组 []
- knowledge_gaps 和 suggested_explorations 至少各输出 1-2 条
- 只输出 JSON，不要有其他内容
```

## 提取结果映射

| 分析输出 | 图谱节点 |
|----------|----------|
| `findings[].fact` | `finding` 节点的 `label` |
| `findings[].category` | `finding.metadata.category` |
| `findings[].significance` | `finding.metadata.significance` |
| `entities` | `finding.metadata.entities` |
| `relations` | `finding.metadata.relations` |
| `followup_questions` | 创建 `question` 节点（`status: unanswered`） |
| `hypothetical_entities` | 创建 `entity` 节点（`status: hypothetical`） |
| `hypothetical_relations` | 创建 `relation` 节点（`status: hypothetical`） |
| `knowledge_gaps` | 创建 `question` 节点（`status: unanswered`, `type: gap`） |
| `suggested_explorations` | 创建 `question` 节点（`status: unanswered`, `type: exploration`） |
