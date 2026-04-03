/**
 * Insight Probe - Knowledge Graph Manager
 * 知识图谱管理器：负责读写和维护调研过程中的节点图
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录（ESM 兼容）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ 工具函数 ============

/**
 * 生成 URL 友好的 slug（保留中文字符）
 */
export function slugify(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '-')           // 空格转横线
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '')  // 保留 ASCII + 中文 + 基本的横线下划线
    .replace(/-+/g, '-')           // 多个横线合并
    .replace(/^-+|-+$/g, '');     // 移除首尾横线
}

/**
 * 生成带时间戳的主题目录名
 */
export function generateTopicDirname(topic: string): string {
  const slug = slugify(topic);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${slug}_${timestamp}`;
}

/**
 * 创建主题调研目录结构
 * @param baseTempDir 临时目录的父目录（通常是项目根目录）
 * @param topic 主题名称
 * @returns 创建的主题目录绝对路径
 */
export function createTopicStructure(baseTempDir: string, topic: string): string {
  const dirName = generateTopicDirname(topic);
  const resolvedBase = path.resolve(baseTempDir);
  const topicDir = path.join(resolvedBase, dirName);
  const subdirs = ['pages', 'search_results', 'reports'];

  fs.mkdirSync(topicDir, { recursive: true });
  for (const subdir of subdirs) {
    fs.mkdirSync(path.join(topicDir, subdir), { recursive: true });
  }

  return topicDir;
}

// ============ 类型定义 ============

export type NodeType = 'topic' | 'search_query' | 'webpage' | 'finding' | 'question';

export interface KGNode {
  id: string;
  type: NodeType;
  label: string;
  // 搜索查询专属
  query?: string;
  round?: number;
  results_count?: number;
  sources?: string[];  // 搜索来源，如 ["searxng", "github", "wikipedia_zh"]
  // 网页节点专属
  url?: string;
  fetched?: boolean;
  fetched_at?: string;
  file?: string;
  key_findings?: string[];
  reliability?: 'high' | 'medium' | 'low';
  // 发现节点专属
  source_nodes?: string[];
  // 问题节点专属
  status?: 'unanswered' | 'answered' | 'partial';
  answered_by?: string;
  // 通用
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 动态关系：从内容中提取的实体之间的关系
 */
export interface DynamicRelation {
  from: string;      // 实体A名称
  to: string;        // 实体B名称
  relation: string;  // 关系类型（自动发现）
  source?: string;   // 来源描述
}

// ============ 页面内容准备（供 Agent 分析）============

export interface PreparedPage {
  content: string;
  title: string;
  url: string;
}

/**
 * 页面内容读取与准备函数
 * 仅读取页面原始内容，由 Agent（使用 prompts.md 中的分析框架）完成分析
 *
 * @param content 页面文本内容
 * @param title 页面标题
 * @param url 页面 URL
 * @returns 包含原始内容的结构，供 Agent 分析使用
 */
export interface PreparedPage {
  content: string;
  title: string;
  url: string;
}

export function analyzePageContent(content: string, title: string, url: string): PreparedPage {
  return { content, title, url };
}

/**
 * 类型化实体（用于查询扩展）
 */
export interface TypedEntity {
  name: string;
  type: '人物' | '组织' | '概念' | '地点' | '事件';
}

/**
 * 知识版本记录（用于追踪知识更新）
 */
export interface KnowledgeVersion {
  version: number;
  label: string;
  timestamp: string;
  changes?: string;  // 变更描述
}

export interface KGEdge {
  from: string;
  to: string;
  relation: string;
}

export interface KnowledgeGraph {
  topic: string;
  created_at: string;
  updated_at: string;
  nodes: KGNode[];
  edges: KGEdge[];
  // 动态关系（从内容中提取）
  dynamicRelations?: DynamicRelation[];
}

const DEFAULT_KG: KnowledgeGraph = {
  topic: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  nodes: [],
  edges: [],
  dynamicRelations: [],
};

// ============ KnowledgeGraphManager 类 ============

export class KnowledgeGraphManager {
  private kg: KnowledgeGraph;
  private filePath: string;
  private nodeCounter: Record<NodeType, number>;

  constructor(topic: string, baseDir: string) {
    this.kg = { ...DEFAULT_KG, topic };
    this.filePath = path.join(baseDir, 'knowledge_graph.json');
    this.nodeCounter = {
      topic: 0,
      search_query: 0,
      webpage: 0,
      finding: 0,
      question: 0,
    };

    // 确保目录存在
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 尝试加载已有图谱
    if (fs.existsSync(this.filePath)) {
      try {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        this.kg = JSON.parse(data);
        this.rebuildCounters();
      } catch (e) {
        console.warn('Failed to load existing knowledge graph, starting fresh');
      }
    }
  }

  private rebuildCounters(): void {
    // 重置计数器
    this.nodeCounter = {
      topic: 0,
      search_query: 0,
      webpage: 0,
      finding: 0,
      question: 0,
    };

    for (const node of this.kg.nodes) {
      // 从 ID 中提取数字部分
      // 支持格式: type_N, type_NN, type_NNN
      const match = node.id.match(/^([a-z_]+)_(\d+)$/);
      if (match) {
        const idType = match[1] as NodeType;
        const num = parseInt(match[2], 10);
        if (idType in this.nodeCounter && !isNaN(num) && num > 0) {
          this.nodeCounter[idType] = Math.max(this.nodeCounter[idType], num);
        }
      }
    }
  }

  private nextId(type: NodeType): string {
    this.nodeCounter[type]++;
    return `${type}_${String(this.nodeCounter[type]).padStart(3, '0')}`;
  }

  private touch(): void {
    this.kg.updated_at = new Date().toISOString();
  }

  // ============ 节点操作 ============

  addTopicNode(label: string): KGNode {
    const node: KGNode = {
      id: 'topic_root',
      type: 'topic',
      label,
      timestamp: new Date().toISOString(),
    };
    // 移除旧topic节点（如果有）
    this.kg.nodes = this.kg.nodes.filter(n => n.id !== 'topic_root');
    this.kg.nodes.push(node);
    this.touch();
    return node;
  }

  addSearchQueryNode(label: string, query: string, round: number, resultsCount: number, sources?: string[]): KGNode {
    const id = this.nextId('search_query');
    const node: KGNode = {
      id,
      type: 'search_query',
      label,
      query,
      round,
      results_count: resultsCount,
      sources,
      timestamp: new Date().toISOString(),
    };
    this.kg.nodes.push(node);

    // 确保 topic_root 存在（如果尚不存在则自动创建）
    if (!this.getNodeById('topic_root')) {
      console.warn(`[addSearchQueryNode] topic_root 不存在，自动创建`);
      this.addTopicNode(this.kg.topic || 'unknown');
    }

    this.addEdge('topic_root', id, '生成');
    this.touch();
    return node;
  }

  addWebpageNode(
    label: string,
    url: string,
    options: {
      fetched?: boolean;
      file?: string;
      keyFindings?: string[];
      reliability?: 'high' | 'medium' | 'low';
      sourceQueryId?: string;
    } = {}
  ): KGNode {
    const id = this.nextId('webpage');
    const node: KGNode = {
      id,
      type: 'webpage',
      label,
      url,
      fetched: options.fetched || false,
      fetched_at: options.fetched ? new Date().toISOString() : undefined,
      file: options.file,
      key_findings: options.keyFindings,
      reliability: options.reliability,
      timestamp: new Date().toISOString(),
    };
    this.kg.nodes.push(node);
    if (options.sourceQueryId) {
      this.addEdge(options.sourceQueryId, id, '返回');
    }
    this.touch();
    return node;
  }

  addFindingNode(
    label: string,
    sourceNodeIds: string[],
    options: {
      metadata?: Record<string, unknown>;
      /** 从内容中提取的动态关系 */
      relations?: DynamicRelation[];
      /** 版本号，用于知识更新追踪 */
      version?: number;
    } = {}
  ): KGNode {
    const id = this.nextId('finding');

    // 验证所有 sourceNodeIds 是否存在于图谱中
    const validSourceIds: string[] = [];
    for (const srcId of sourceNodeIds) {
      const node = this.getNodeById(srcId);
      if (node) {
        validSourceIds.push(srcId);
      } else {
        console.warn(`[addFindingNode] Warning: sourceNodeId "${srcId}" not found in graph. Valid IDs: ${this.kg.nodes.map(n => n.id).join(', ')}`);
      }
    }

    // 如果没有任何有效的 sourceNodeId，fallback 到 topic_root
    if (validSourceIds.length === 0) {
      console.warn(`[addFindingNode] No valid sourceNodeIds for finding "${label}". Falling back to topic_root.`);
      validSourceIds.push('topic_root');
    }

    const node: KGNode = {
      id,
      type: 'finding',
      label,
      source_nodes: validSourceIds,
      timestamp: new Date().toISOString(),
      metadata: {
        ...options.metadata,
        version: options.version || 1,
        relations: options.relations || [],
      },
    };
    this.kg.nodes.push(node);

    // 添加结构边（包含关系）
    for (const srcId of validSourceIds) {
      this.addEdge(srcId, id, '包含');
    }

    // 添加动态关系（从内容中提取的实体关系）
    if (options.relations && options.relations.length > 0) {
      this.addDynamicRelations(options.relations);
    }

    this.touch();
    return node;
  }

  /**
   * 添加动态关系（从内容中自动提取）
   */
  addDynamicRelations(relations: DynamicRelation[]): void {
    if (!this.kg.dynamicRelations) {
      this.kg.dynamicRelations = [];
    }

    for (const rel of relations) {
      // 去重检查
      const exists = this.kg.dynamicRelations.some(
        r => r.from === rel.from && r.to === rel.to && r.relation === rel.relation
      );
      if (!exists) {
        this.kg.dynamicRelations.push(rel);
      }
    }
    this.touch();
  }

  /**
   * 更新知识（创建新版本）
   */
  updateFinding(
    findingId: string,
    newLabel: string,
    options: {
      metadata?: Record<string, unknown>;
      relations?: DynamicRelation[];
      changes?: string;
    } = {}
  ): KGNode | null {
    const finding = this.kg.nodes.find(n => n.id === findingId && n.type === 'finding');
    if (!finding) return null;

    const currentVersion = (finding.metadata?.version as number) || 1;
    const now = new Date().toISOString();

    // 记录历史版本
    const previousVersions: KnowledgeVersion[] = [
      ...((finding.metadata?.versionHistory as KnowledgeVersion[]) || []),
      {
        version: currentVersion,
        label: finding.label,
        timestamp: finding.timestamp || now,
        changes: options.changes || '',
      },
    ];

    // 更新节点
    finding.label = newLabel;
    finding.timestamp = now;
    finding.metadata = {
      ...finding.metadata,
      ...options.metadata,
      version: currentVersion + 1,
      versionHistory: previousVersions,
      relations: options.relations || finding.metadata?.relations || [],
    };

    // 更新动态关系
    if (options.relations && options.relations.length > 0) {
      this.addDynamicRelations(options.relations);
    }

    this.touch();
    return finding;
  }

  /**
   * 获取知识的所有版本历史
   */
  getFindingVersionHistory(findingId: string): KnowledgeVersion[] {
    const finding = this.kg.nodes.find(n => n.id === findingId && n.type === 'finding');
    if (!finding) return [];
    return (finding.metadata?.versionHistory as KnowledgeVersion[]) || [];
  }

  /**
   * 获取所有动态关系
   */
  getDynamicRelations(): DynamicRelation[] {
    return this.kg.dynamicRelations || [];
  }

  /**
   * 按轮次组织搜索查询
   */
  private getQueriesByRound(): Map<number, KGNode[]> {
    const queriesByRound = new Map<number, KGNode[]>();
    for (const node of this.kg.nodes) {
      if (node.type === 'search_query' && node.round !== undefined) {
        if (!queriesByRound.has(node.round)) {
          queriesByRound.set(node.round, []);
        }
        queriesByRound.get(node.round)!.push(node);
      }
    }
    return queriesByRound;
  }

  addQuestionNode(
    label: string,
    options: { sourceNodeId?: string } = {}
  ): KGNode {
    const id = this.nextId('question');
    const node: KGNode = {
      id,
      type: 'question',
      label,
      status: 'unanswered',
      timestamp: new Date().toISOString(),
    };
    this.kg.nodes.push(node);
    if (options.sourceNodeId) {
      const sourceNode = this.getNodeById(options.sourceNodeId);
      if (sourceNode) {
        this.addEdge(options.sourceNodeId, id, '提出');
      } else {
        console.warn(`[addQuestionNode] Warning: sourceNodeId "${options.sourceNodeId}" not found in graph. Skipping edge creation.`);
      }
    }
    this.touch();
    return node;
  }

  answerQuestion(questionId: string, answerNodeId: string): void {
    const question = this.kg.nodes.find(n => n.id === questionId && n.type === 'question');
    if (question) {
      question.status = 'answered';
      question.answered_by = answerNodeId;
      this.addEdge(questionId, answerNodeId, '被回答');
      this.touch();
    }
  }

  // ============ 边操作 ============

  addEdge(from: string, to: string, relation: string): KGEdge {
    // 验证 from 和 to 节点是否存在
    const fromNode = this.getNodeById(from);
    const toNode = this.getNodeById(to);
    if (!fromNode) {
      console.warn(`[addEdge] Warning: from node "${from}" not found in graph. Valid IDs: ${this.kg.nodes.map(n => n.id).join(', ')}`);
    }
    if (!toNode) {
      console.warn(`[addEdge] Warning: to node "${to}" not found in graph. Valid IDs: ${this.kg.nodes.map(n => n.id).join(', ')}`);
    }

    const edge: KGEdge = { from, to, relation };
    const exists = this.kg.edges.some(
      e => e.from === from && e.to === to && e.relation === relation
    );
    if (!exists) {
      this.kg.edges.push(edge);
    }
    return edge;
  }

  // ============ 查询操作 ============

  getNodesByType(type: NodeType): KGNode[] {
    return this.kg.nodes.filter(n => n.type === type);
  }

  getUnansweredQuestions(): KGNode[] {
    return this.kg.nodes.filter(n => n.type === 'question' && n.status === 'unanswered');
  }

  getPendingQuestions(): KGNode[] {
    return this.kg.nodes.filter(n => n.type === 'question' && n.status !== 'answered');
  }

  getNodeById(id: string): KGNode | undefined {
    return this.kg.nodes.find(n => n.id === id);
  }

  getWebpagesNotFetched(): KGNode[] {
    return this.kg.nodes.filter(n => n.type === 'webpage' && !n.fetched);
  }

  /**
   * 核心方法：从图谱状态推导下一步搜索方向（AI 驱动）
   *
   * 优先级：
   * 1. 未回答的 question 节点（直接转为搜索查询）
   * 2. AI 分析图谱状态，从 findings/entities 中推导搜索方向
   * 3. 返回空数组表示图谱已收敛
   */
  async deriveNextQueries(maxQueries: number = 4, round?: number): Promise<Array<{
    query: string;
    reason: string;
    sourceNodeId: string;
    sourceType: 'question' | 'finding';
  }>> {
    const queries: Array<{
      query: string;
      reason: string;
      sourceNodeId: string;
      sourceType: 'question' | 'finding';
    }> = [];

    // 已有查询去重（同时检查 query 字段和 label 字段）
    const existingQueryTexts = new Set(
      this.kg.nodes
        .filter(n => n.type === 'search_query')
        .flatMap(n => [n.label, n.query].filter(Boolean))
    );

    // 优先级 1：未回答的 question（纯逻辑，不需要 AI）
    const unanswered = this.getUnansweredQuestions();
    for (const q of unanswered) {
      const queryText = q.label;
      if (!existingQueryTexts.has(queryText)) {
        queries.push({
          query: queryText,
          reason: `来自未回答的问题: ${q.label}`,
          sourceNodeId: q.id,
          sourceType: 'question',
        });
      }
      if (queries.length >= maxQueries) return queries;
    }

    // 优先级 2：基于已有 findings 的实体推导搜索方向（本地逻辑，无需 API）
    // 如果指定了 round，过滤该 round 之前的 finding
    const relevantFindings = round !== undefined
      ? this.getFindings().filter(f => {
          const fRound = f.metadata?.round as number | undefined;
          return fRound === undefined || fRound >= round - 1;
        })
      : this.getFindings();

    if (relevantFindings.length > 0) {
      const allEntities = new Set<string>();
      for (const f of relevantFindings) {
        const entities = (f.metadata?.entities as string[] || []);
        for (const e of entities) {
          if (typeof e === 'string') allEntities.add(e);
        }
      }

      for (const entity of allEntities) {
        if (queries.length >= maxQueries) break;
        const entityQuery = `${entity}`;
        if (!existingQueryTexts.has(entityQuery)) {
          queries.push({
            query: entityQuery,
            reason: `来自已有发现的实体: ${entity}`,
            sourceNodeId: relevantFindings[0]?.id || 'topic_root',
            sourceType: 'finding' as const,
          });
        }
      }
    }

    return queries;
  }

  /**
   * 检查图谱是否收敛（没有新的搜索方向）
   */
  async isConverged(): Promise<boolean> {
    const nextQueries = await this.deriveNextQueries(1);
    return nextQueries.length === 0;
  }

  /**
   * 获取图谱中所有实体（从 finding 和 webpage 节点提取）
   */
  getAllEntities(): string[] {
    const entitySet = new Set<string>();
    for (const n of this.kg.nodes) {
      const entities = n.metadata?.entities as string[] | undefined;
      if (entities) {
        for (const e of entities) entitySet.add(e);
      }
    }
    return Array.from(entitySet);
  }

  getFindings(): KGNode[] {
    return this.kg.nodes.filter(n => n.type === 'finding');
  }

  // ============ 图谱统计 ============

  getStats(): Record<NodeType, number> & { edges: number; unanswered: number; dynamicRelations: number } {
    const stats = {
      topic: 0,
      search_query: 0,
      webpage: 0,
      finding: 0,
      question: 0,
      edges: this.kg.edges.length,
      unanswered: this.getUnansweredQuestions().length,
      dynamicRelations: this.kg.dynamicRelations?.length || 0,
    };
    for (const node of this.kg.nodes) {
      stats[node.type]++;
    }
    return stats;
  }

  /**
   * 数据完整性检查
   * 检查图谱中的各种完整性问题并输出警告
   */
  validate(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const nodeIds = new Set(this.kg.nodes.map(n => n.id));

    // 检查 1：边引用了不存在的节点
    for (const edge of this.kg.edges) {
      if (!nodeIds.has(edge.from)) {
        warnings.push(`边引用了不存在的源节点: ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        warnings.push(`边引用了不存在的目标节点: ${edge.to}`);
      }
    }

    // 检查 2：finding 节点没有 source_nodes 或 source_nodes 为空/无效
    for (const finding of this.kg.nodes.filter(n => n.type === 'finding')) {
      const sourceNodes = (finding as any).source_nodes;
      if (!sourceNodes || sourceNodes.length === 0) {
        warnings.push(`Finding "${(finding as any).label}" 没有 source_nodes`);
      } else {
        // 检查 source_nodes 是否为有效的节点 ID（而不是 URL 或其他字符串）
        const invalidSources = sourceNodes.filter((sid: string) => !nodeIds.has(sid));
        if (invalidSources.length > 0) {
          warnings.push(`Finding "${(finding as any).label}" 的 source_nodes 包含无效ID: ${invalidSources.join(', ')}`);
        }
      }
    }

    // 检查 3：webpage 节点没有 file 路径（未抓取）
    for (const webpage of this.kg.nodes.filter(n => n.type === 'webpage')) {
      if (!(webpage as any).file) {
        warnings.push(`Webpage "${(webpage as any).label}" 没有 file 路径（可能未抓取）`);
      }
    }

    // 检查 4：finding 没有 content（只有 label）
    for (const finding of this.kg.nodes.filter(n => n.type === 'finding')) {
      if (!(finding as any).content && !(finding as any).metadata?.content) {
        warnings.push(`Finding "${(finding as any).label}" 缺少 content 字段`);
      }
    }

    // 检查 5：topic_root 没有生成任何边（孤立的根节点）
    const topicRootEdges = this.kg.edges.filter(e => e.from === 'topic_root');
    if (nodeIds.has('topic_root') && topicRootEdges.length === 0) {
      warnings.push(`topic_root 是孤立的（没有任何边）`);
    }

    // 检查 6：search_query 节点没有 round 字段
    for (const sq of this.kg.nodes.filter(n => n.type === 'search_query')) {
      if ((sq as any).round === undefined) {
        warnings.push(`SearchQuery "${(sq as any).label || (sq as any).query}" 缺少 round 字段`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }

  // ============ 持久化 ============

  save(): void {
    this.touch();
    fs.writeFileSync(this.filePath, JSON.stringify(this.kg, null, 2), 'utf-8');
  }

  load(): KnowledgeGraph {
    if (fs.existsSync(this.filePath)) {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      this.kg = JSON.parse(data);
      this.rebuildCounters();
    }
    return this.kg;
  }

  // ============ 导出 ============

  toJSON(): string {
    return JSON.stringify(this.kg, null, 2);
  }

  /**
   * 生成 Mermaid 格式的图谱可视化（中文标签）
   */
  toMermaid(): string {
    const nodeTypeLabels: Record<NodeType, string> = {
      topic: '主题',
      search_query: '搜索查询',
      webpage: '网页',
      finding: '发现',
      question: '问题',
    };

    const lines = ['graph TD'];

    for (const node of this.kg.nodes) {
      const label = node.label.replace(/"/g, "'").substring(0, 50);
      lines.push(`    ${node.id}["${label}"]:::${node.type}`);
    }

    lines.push('');
    lines.push('    classDef topic fill:#e1f5ff,stroke:#0288d1,stroke-width:2px,rx:8');
    lines.push('    classDef search_query fill:#fff3e0,stroke:#f57c00,stroke-width:2px,rx:8');
    lines.push('    classDef webpage fill:#e8f5e9,stroke:#388e3c,stroke-width:2px,rx:8');
    lines.push('    classDef finding fill:#fce4ec,stroke:#c2185b,stroke-width:2px,rx:8');
    lines.push('    classDef question fill:#fff8e1,stroke:#ffa000,stroke-width:2px,rx:8');

    const relationLabels: Record<string, string> = {
      // 中文关系名称
      '生成': '生成',
      '返回': '返回',
      '包含': '包含',
      '提出': '提出',
      '被回答': '被回答',
      // 英文关系名称（兼容旧数据）
      'spawned': '生成',
      'returned': '返回',
      'contained': '包含',
      'raised': '提出',
      'answered_by': '被回答',
    };

    for (const edge of this.kg.edges) {
      const relLabel = relationLabels[edge.relation] || edge.relation;
      lines.push(`    ${edge.from} -->|"${relLabel}"| ${edge.to}`);
    }

    return lines.join('\n');
  }

  /**
   * 生成美观的 HTML 可视化（使用 D3.js 力导向图）
   * 输出路径：{topic_dir}/reports/knowledge_graph.html
   */
  toHtmlImage(): string {
    const nodeTypeLabels: Record<NodeType, string> = {
      topic: '主题',
      search_query: '搜索查询',
      webpage: '网页',
      finding: '发现',
      question: '问题',
    };

    const nodeColors: Record<NodeType, { bg: string; border: string; text: string }> = {
      topic: { bg: '#e3f2fd', border: '#1565c0', text: '#0d47a1' },
      search_query: { bg: '#fff3e0', border: '#e65100', text: '#bf360c' },
      webpage: { bg: '#e8f5e9', border: '#1b5e20', text: '#1b5e20' },
      finding: { bg: '#fce4ec', border: '#880e4f', text: '#880e4f' },
      question: { bg: '#fff8e1', border: '#ff6f00', text: '#e65100' },
    };

    const nodes = this.kg.nodes.map(n => ({
      id: n.id,
      label: n.label.length > 30 ? n.label.substring(0, 30) + '...' : n.label,
      fullLabel: n.label,
      type: n.type,
      typeLabel: nodeTypeLabels[n.type],
      color: nodeColors[n.type],
    }));

    const links = this.kg.edges.map(e => ({
      source: e.from,
      target: e.to,
      relation: e.relation,
    }));

    // 安全序列化 JSON，防止 XSS
    const json = JSON.stringify({ nodes, links })
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>知识图谱 - ${this.kg.topic.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      color: #fff;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 600;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 8px;
    }
    .header p {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
    }
    #graph {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    .node {
      cursor: pointer;
      transition: filter 0.2s;
    }
    .node:hover {
      filter: brightness(1.2);
    }
    .node-label {
      font-size: 11px;
      fill: #333;
      text-anchor: middle;
      pointer-events: none;
    }
    .node-type {
      font-size: 9px;
      fill: rgba(0,0,0,0.5);
      text-anchor: middle;
      pointer-events: none;
    }
    .link {
      stroke: rgba(255,255,255,0.2);
      stroke-width: 1.5px;
      fill: none;
    }
    .link-label {
      font-size: 10px;
      fill: rgba(255,255,255,0.5);
      text-anchor: middle;
      pointer-events: none;
    }
    .legend {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 20px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(255,255,255,0.8);
      font-size: 12px;
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 4px;
    }
    .tooltip {
      position: absolute;
      background: rgba(0,0,0,0.85);
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 12px;
      max-width: 300px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 100;
      line-height: 1.5;
    }
    .tooltip.visible {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${this.kg.topic}</h1>
    <p>共 ${nodes.length} 个节点，${links.length} 条关系</p>
  </div>
  <svg id="graph"></svg>
  <div class="legend">
    ${Object.entries(nodeTypeLabels).map(([type, label]) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${nodeColors[type as NodeType].bg};border:2px solid ${nodeColors[type as NodeType].border}"></div>
      <span>${label}</span>
    </div>`).join('')}
  </div>
  <div class="tooltip" id="tooltip"></div>

  <script>
    const data = ${json};

    const width = Math.min(1200, window.innerWidth - 40);
    const height = Math.min(800, window.innerHeight - 200);

    const svg = d3.select("#graph")
      .attr("width", width)
      .attr("height", height);

    const defs = svg.append("defs");
    // 添加渐变效果
    const gradient = defs.append("linearGradient")
      .attr("id", "linkGradient")
      .attr("gradientUnits", "userSpaceOnUse");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#667eea");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#764ba2");

    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(d => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50));

    const link = svg.append("g")
      .selectAll("line")
      .data(data.links)
      .join("line")
      .attr("class", "link")
      .attr("stroke", "url(#linkGradient)")
      .attr("stroke-width", 2);

    const linkLabels = svg.append("g")
      .selectAll("text")
      .data(data.links)
      .join("text")
      .attr("class", "link-label")
      .text(d => d.relation);

    const nodeGroup = svg.append("g")
      .selectAll("g")
      .data(data.nodes)
      .join("g")
      .attr("class", "node")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    nodeGroup.append("rect")
      .attr("rx", 8)
      .attr("ry", 8)
      .attr("width", d => Math.min(d.label.length * 14 + 24, 180))
      .attr("height", 50)
      .attr("x", d => -Math.min(d.label.length * 14 + 24, 180) / 2)
      .attr("y", -25)
      .attr("fill", d => d.color.bg)
      .attr("stroke", d => d.color.border)
      .attr("stroke-width", 2);

    nodeGroup.append("text")
      .attr("class", "node-label")
      .attr("dy", 4)
      .text(d => d.label);

    nodeGroup.append("text")
      .attr("class", "node-type")
      .attr("dy", -12)
      .text(d => d.typeLabel);

    const tooltip = document.getElementById("tooltip");

    nodeGroup.on("mouseover", function(event, d) {
      tooltip.innerHTML = \`<strong>\${d.typeLabel}</strong><br>\${d.fullLabel}\`;
      tooltip.classList.add("visible");
    }).on("mousemove", function(event) {
      tooltip.style.left = (event.pageX + 10) + "px";
      tooltip.style.top = (event.pageY - 10) + "px";
    }).on("mouseout", function() {
      tooltip.classList.remove("visible");
    });

    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      linkLabels
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);

      nodeGroup.attr("transform", d => \`translate(\${d.x},\${d.y})\`);
    });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  </script>
</body>
</html>`;
  }

  /**
   * 生成调研记录（记录调研过程）
   */
  toResearchRecord(): string {
    const lines: string[] = [];
    const stats = this.getStats();

    lines.push(`# ${this.kg.topic} - 调研记录`);
    lines.push('');
    lines.push(`**调研主题**: ${this.kg.topic}`);
    lines.push(`**开始时间**: ${this.kg.created_at}`);
    lines.push(`**最后更新**: ${this.kg.updated_at}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 调研统计');
    lines.push('');
    lines.push(`| 指标 | 数量 |`);
    lines.push(`|------|------|`);
    lines.push(`| 搜索查询 | ${stats.search_query} |`);
    lines.push(`| 抓取网页 | ${stats.webpage} |`);
    lines.push(`| 发现知识 | ${stats.finding} |`);
    lines.push(`| 待解答问题 | ${stats.unanswered} |`);
    lines.push(`| 关系边数 | ${stats.edges} |`);
    lines.push(`| 动态关系 | ${this.kg.dynamicRelations?.length || 0} |`);
    lines.push('');

    // 按轮次组织搜索查询
    const queriesByRound = this.getQueriesByRound();

    if (queriesByRound.size > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 调研过程（按轮次）');
      lines.push('');

      const sortedRounds = Array.from(queriesByRound.keys()).sort((a, b) => a - b);
      for (const round of sortedRounds) {
        const queries = queriesByRound.get(round)!;
        lines.push(`### 第 ${round} 轮搜索`);
        lines.push('');

        for (const q of queries) {
          lines.push(`- **查询**: ${q.label}`);
          lines.push(`  - 来源: ${(q.sources || []).join(', ') || '未知'}`);
          lines.push(`  - 结果数: ${q.results_count || 0}`);
        }
        lines.push('');
      }
    }

    // 动态关系
    const dynamicRelations = this.getDynamicRelations();
    if (dynamicRelations.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 自动发现的实体关系');
      lines.push('');
      lines.push('| 实体A | 关系 | 实体B | 来源 |');
      lines.push('|------|------|------|------|');
      for (const rel of dynamicRelations) {
        lines.push(`| ${rel.from} | ${rel.relation} | ${rel.to} | ${rel.source || '-'} |`);
      }
      lines.push('');
    }

    // 未解答问题
    const unanswered = this.getUnansweredQuestions();
    if (unanswered.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 待深入问题');
      lines.push('');
      for (const q of unanswered) {
        lines.push(`- ${q.label}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(`*生成时间: ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  /**
   * 生成知识列表
   */
  toKnowledgeList(): string {
    const lines: string[] = [];
    const findings = this.getFindings();

    lines.push(`# ${this.kg.topic} - 知识列表`);
    lines.push('');
    lines.push(`共 ${findings.length} 条知识`);
    lines.push('');

    // 按类别分组
    const byCategory = new Map<string, typeof findings>();
    for (const f of findings) {
      const cat = (f.metadata?.category as string) || '未分类';
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(f);
    }

    lines.push('## 类别统计');
    lines.push('');
    for (const [cat, items] of byCategory) {
      lines.push(`- **${cat}**: ${items.length} 条`);
    }
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push('## 知识详情');
    lines.push('');

    let idx = 1;
    for (const f of findings) {
      const version = (f.metadata?.version as number) || 1;
      const versionNote = version > 1 ? ` (v${version})` : '';
      lines.push(`### ${idx}. ${f.label}${versionNote}`);
      lines.push('');

      if (f.metadata?.category) {
        lines.push(`**类别**: ${f.metadata.category}`);
      }
      if (f.metadata?.significance) {
        lines.push(`**重要性**: ${f.metadata.significance}`);
      }
      // 事实引用来源
      const sourceUrl = f.metadata?.sourceUrl as string | undefined;
      if (sourceUrl) {
        const webpageNode = this.kg.nodes.find(n => n.type === 'webpage' && n.url === sourceUrl);
        const sourceLabel = webpageNode?.label || sourceUrl;
        lines.push(`**来源**: [${sourceLabel}](${sourceUrl})`);
      }
      if (f.source_nodes && f.source_nodes.length > 0) {
        const sources = f.source_nodes
          .map(id => this.kg.nodes.find(n => n.id === id))
          .filter(Boolean)
          .map(n => n!.type === 'webpage' ? n!.label : n!.id);
        lines.push(`**来源**: ${sources.join(', ')}`);
      }

      // 版本历史
      const versionHistory = f.metadata?.versionHistory as KnowledgeVersion[] | undefined;
      if (versionHistory && versionHistory.length > 0) {
        lines.push('');
        lines.push('**更新历史**:');
        for (const v of versionHistory) {
          lines.push(`  - v${v.version}: ${v.label} (${v.timestamp})`);
        }
      }

      // 关联实体
      const entities = f.metadata?.entities as string[] | undefined;
      if (entities && entities.length > 0) {
        lines.push('');
        lines.push(`**关联实体**: ${entities.join(', ')}`);
      }

      lines.push('');
      lines.push('---');
      lines.push('');
      idx++;
    }

    // 动态关系
    const dynamicRelations = this.getDynamicRelations();
    if (dynamicRelations.length > 0) {
      lines.push('## 实体关系图谱');
      lines.push('');
      for (const rel of dynamicRelations) {
        lines.push(`- **${rel.from}** ${rel.relation} **${rel.to}**`);
      }
      lines.push('');
    }

    lines.push(`*生成时间: ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  /**
   * 生成最终报告（综合调研报告）
   */
  toFinalReport(): string {
    const lines: string[] = [];
    const stats = this.getStats();
    const findings = this.getFindings();
    const questions = this.getPendingQuestions();
    const dynamicRelations = this.getDynamicRelations();

    lines.push(`# ${this.kg.topic} - 深度调研报告`);
    lines.push('');
    lines.push('## 执行摘要');
    lines.push('');
    lines.push(`本报告对"${this.kg.topic}"进行了系统性深度调研。`);
    lines.push(`调研周期: ${this.kg.created_at} 至 ${this.kg.updated_at}。`);
    lines.push(`累计完成 ${stats.search_query} 轮搜索，抓取 ${stats.webpage} 个页面，提取 ${stats.finding} 条知识。`);
    if (stats.unanswered > 0) {
      lines.push(`尚有 ${stats.unanswered} 个问题待进一步研究。`);
    }
    lines.push('');

    // 核心发现
    lines.push('---');
    lines.push('');
    lines.push('## 核心发现');
    lines.push('');

    if (findings.length === 0) {
      lines.push('暂无发现内容。');
    } else {
      // 按类别组织
      const byCategory = new Map<string, typeof findings>();
      for (const f of findings) {
        const cat = (f.metadata?.category as string) || '未分类';
        if (!byCategory.has(cat)) {
          byCategory.set(cat, []);
        }
        byCategory.get(cat)!.push(f);
      }

      for (const [cat, items] of byCategory) {
        lines.push(`### ${cat}`);
        lines.push('');
        for (const f of items) {
          const version = (f.metadata?.version as number) || 1;
          const versionNote = version > 1 ? ` *(已更新 ${version - 1} 次)*` : '';
          lines.push(`1. **${f.label}**${versionNote}`);
          if (f.metadata?.significance) {
            lines.push(`   - ${f.metadata.significance}`);
          }
          // 事实引用
          const sourceUrl = f.metadata?.sourceUrl as string | undefined;
          if (sourceUrl) {
            const webpageNode = this.kg.nodes.find(n => n.type === 'webpage' && n.url === sourceUrl);
            const sourceLabel = webpageNode?.label || sourceUrl;
            lines.push(`   > 来源: [${sourceLabel}](${sourceUrl})`);
          }
        }
        lines.push('');
      }
    }

    // 实体关系
    if (dynamicRelations.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 实体关系网络');
      lines.push('');
      lines.push('以下关系从调研内容中自动提取：');
      lines.push('');
      for (const rel of dynamicRelations) {
        lines.push(`- **${rel.from}** ${rel.relation} **${rel.to}** ${rel.source ? `(${rel.source})` : ''}`);
      }
      lines.push('');
    }

    // 调研过程
    lines.push('---');
    lines.push('');
    lines.push('## 调研过程');
    lines.push('');

    const queriesByRound = this.getQueriesByRound();

    if (queriesByRound.size > 0) {
      const sortedRounds = Array.from(queriesByRound.keys()).sort((a, b) => a - b);
      for (const round of sortedRounds) {
        const queries = queriesByRound.get(round)!;
        lines.push(`### 第 ${round} 轮`);
        lines.push('');
        lines.push('**搜索方向**:');
        for (const q of queries) {
          lines.push(`- ${q.label}`);
        }

        // 该轮发现的网页
        const webpages = this.kg.nodes.filter(n =>
          n.type === 'webpage' &&
          n.metadata?.sourceQueryId &&
          queries.some(q => q.id === n.metadata?.sourceQueryId)
        );
        if (webpages.length > 0) {
          lines.push('');
          lines.push('**参考来源**:');
          for (const w of webpages.slice(0, 3)) {
            lines.push(`- ${w.label}`);
          }
        }
        lines.push('');
      }
    }

    // 未解答问题
    if (questions.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 待深入研究');
      lines.push('');
      lines.push('以下问题在本次调研中尚未完全解答，值得进一步研究：');
      lines.push('');
      for (const q of questions) {
        lines.push(`- ${q.label}`);
      }
      lines.push('');
    }

    // 附录：统计摘要
    lines.push('---');
    lines.push('');
    lines.push('## 附录：调研统计');
    lines.push('');
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 搜索轮次 | ${queriesByRound.size} |`);
    lines.push(`| 搜索查询 | ${stats.search_query} |`);
    lines.push(`| 抓取网页 | ${stats.webpage} |`);
    lines.push(`| 提取知识 | ${stats.finding} |`);
    lines.push(`| 发现关系 | ${dynamicRelations.length} |`);
    lines.push(`| 待解答问题 | ${stats.unanswered} |`);
    lines.push('');

    lines.push(`*报告生成时间: ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  /**
   * 打印摘要报告
   */
  printSummary(): void {
    const stats = this.getStats();
    console.log(`\n[Knowledge Graph] ${this.kg.topic}`);
    console.log('-'.repeat(40));
    console.log(`  topic: ${stats.topic}`);
    console.log(`  search_query: ${stats.search_query}`);
    console.log(`  webpage: ${stats.webpage}`);
    console.log(`  finding: ${stats.finding}`);
    console.log(`  question: ${stats.question}`);
    console.log(`  edges: ${stats.edges}`);
    console.log(`  unanswered: ${stats.unanswered}`);
    console.log('-'.repeat(40));

    const questions = this.getPendingQuestions();
    if (questions.length > 0) {
      console.log('\n[Pending Questions]');
      for (const q of questions) {
        console.log(`  - ${q.label} (${q.id})`);
      }
    }
  }

  /**
   * 清理过期临时文件
   * @param maxAgeHours 超过多少小时的文件视为过期（默认 24h）
   */
  clean(maxAgeHours: number = 24): { deleted: number; updated: number } {
    const dir = path.dirname(this.filePath);
    let deleted = 0;
    let updated = 0;
    const now = Date.now();
    const msPerHour = 1000 * 60 * 60;

    // 递归清理目录
    const cleanDir = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          // 递归清理子目录
          cleanDir(fullPath);
          // 如果子目录为空，删除它
          const remaining = fs.readdirSync(fullPath);
          if (remaining.length === 0) {
            fs.rmdirSync(fullPath);
            deleted++;
          }
        } else {
          const stat = fs.statSync(fullPath);
          const ageHours = (now - stat.mtimeMs) / msPerHour;
          if (ageHours > maxAgeHours) {
            fs.unlinkSync(fullPath);
            deleted++;
          } else {
            fs.utimesSync(fullPath, stat.atime, stat.mtime);
            updated++;
          }
        }
      }
    };

    // 清理 search_results 目录
    const searchResultsDir = path.join(dir, 'search_results');
    cleanDir(searchResultsDir);

    // 清理 pages 目录
    const pagesDir = path.join(dir, 'pages');
    cleanDir(pagesDir);

    return { deleted, updated };
  }
}

// ============ CLI 入口 ============

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'init') {
    const topic = args[1] || 'test-topic';
    const baseDir = args[2] || `./temp/${generateTopicDirname(topic)}`;
    createTopicStructure('./temp', topic);
    const kgm = new KnowledgeGraphManager(topic, baseDir);
    kgm.addTopicNode(topic);
    kgm.save();
    console.log(`[KG] Initialized: ${topic}`);
    console.log(`     Dir: ${baseDir}`);
  } else if (command === 'stats') {
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg stats <baseDir>');
      process.exit(1);
    }
    const kgm = new KnowledgeGraphManager('', baseDir);
    kgm.load();
    kgm.printSummary();
  } else if (command === 'mermaid') {
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg mermaid <baseDir>');
      process.exit(1);
    }
    const kgm = new KnowledgeGraphManager('', baseDir);
    kgm.load();
    console.log(kgm.toMermaid());
  } else if (command === 'image') {
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg image <baseDir>');
      process.exit(1);
    }
    const resolvedBaseDir = path.resolve(baseDir);
    const kgm = new KnowledgeGraphManager('', resolvedBaseDir);
    kgm.load();
    const html = kgm.toHtmlImage();
    const reportsDir = path.join(resolvedBaseDir, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const outputPath = path.join(reportsDir, 'knowledge_graph.html');
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`\n[KG] 知识图谱已导出为 HTML 图片`);
    console.log(`     路径: ${outputPath}`);
    console.log(`\n请在浏览器中打开该文件查看美观的知识图谱可视化。`);
  } else if (command === 'report') {
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg report <baseDir>');
      process.exit(1);
    }
    const resolvedBaseDir = path.resolve(baseDir);
    const kgm = new KnowledgeGraphManager('', resolvedBaseDir);
    kgm.load();
    const report = kgm.toFinalReport();
    const reportsDir = path.join(resolvedBaseDir, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const outputPath = path.join(reportsDir, 'final_report.md');
    fs.writeFileSync(outputPath, report, 'utf-8');
    console.log(`\n[KG] 最终报告已生成`);
    console.log(`     路径: ${outputPath}`);
  } else if (command === 'research-record') {
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg research-record <baseDir>');
      process.exit(1);
    }
    const resolvedBaseDir = path.resolve(baseDir);
    const kgm = new KnowledgeGraphManager('', resolvedBaseDir);
    kgm.load();
    const record = kgm.toResearchRecord();
    const reportsDir = path.join(resolvedBaseDir, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const outputPath = path.join(reportsDir, 'research_record.md');
    fs.writeFileSync(outputPath, record, 'utf-8');
    console.log(`\n[KG] 调研记录已生成`);
    console.log(`     路径: ${outputPath}`);
  } else if (command === 'knowledge-list') {
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg knowledge-list <baseDir>');
      process.exit(1);
    }
    const resolvedBaseDir = path.resolve(baseDir);
    const kgm = new KnowledgeGraphManager('', resolvedBaseDir);
    kgm.load();
    const list = kgm.toKnowledgeList();
    const reportsDir = path.join(resolvedBaseDir, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const outputPath = path.join(reportsDir, 'knowledge_list.md');
    fs.writeFileSync(outputPath, list, 'utf-8');
    console.log(`\n[KG] 知识列表已生成`);
    console.log(`     路径: ${outputPath}`);
  } else if (command === 'next') {
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg next <baseDir>');
      process.exit(1);
    }
    const kgm = new KnowledgeGraphManager('', baseDir);
    kgm.load();
    const queries = await kgm.deriveNextQueries(6);
    if (queries.length === 0) {
      console.log('\n[KG] Converged - no more search directions needed');
    } else {
      console.log(`\n[KG] ${queries.length} search directions:\n`);
      for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        console.log(`  ${i+1}. [${q.sourceType}] ${q.query}`);
        console.log(`     Reason: ${q.reason}`);
        console.log('');
      }
    }
  } else if (command === 'clean') {
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg clean <baseDir> [--max-age <hours>]');
      process.exit(1);
    }
    const maxAge = parseInt(args.find((a, i) => args[i - 1] === '--max-age') || '24', 10);
    const kgm = new KnowledgeGraphManager('', baseDir);
    kgm.load();
    const result = kgm.clean(maxAge);
    console.log(`\n[KG] Cleanup complete`);
    console.log(`     Deleted: ${result.deleted} expired files`);
    console.log(`     Kept: ${result.updated} files`);
  } else if (command === 'analyze') {
    // 准备页面内容供 Agent 分析（Agent 自己读取并分析页面）
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg analyze <baseDir> [--max <n>]');
      process.exit(1);
    }
    const resolvedBaseDir = path.resolve(baseDir);
    const maxPages = parseInt(args.find((a, i) => args[i - 1] === '--max') || '10', 10);

    // 读取 pages_manifest.json
    const manifestPath = path.join(resolvedBaseDir, 'pages_manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error('[KG] Error: pages_manifest.json not found. Run research first.');
      process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const kgm = new KnowledgeGraphManager('', resolvedBaseDir);
    kgm.load();

    // 获取已分析的页面（从图谱中查找 key_findings）
    const analyzedUrls = new Set(
      kgm.kg.nodes
        .filter(n => n.type === 'webpage' && n.key_findings && n.key_findings.length > 0)
        .map(n => n.url)
    );

    // 过滤需要分析的页面
    const pagesToAnalyze = manifest.pages.filter((p: any) => !analyzedUrls.has(p.url));

    if (pagesToAnalyze.length === 0) {
      console.log('[KG] No new pages to analyze.');
    } else {
      console.log(`[KG] ${pagesToAnalyze.length} pages ready for Agent analysis (showing first ${maxPages}):\n`);
      for (let i = 0; i < Math.min(pagesToAnalyze.length, maxPages); i++) {
        const page = pagesToAnalyze[i];
        console.log(`  ${i + 1}. ${page.url}`);
        console.log(`     File: ${page.file}`);
        console.log(`     Score: ${page.score?.toFixed(2) || 'N/A'}`);
        console.log('');
      }
      console.log('[KG] Agent should:');
      console.log('   1. Read each page file');
      console.log('   2. Use the analysis prompt (see references/prompts.md) to extract findings');
      console.log('   3. Run: bun run kg add-findings <baseDir> to update the graph');
    }

  } else if (command === 'add-findings') {
    // 从标准输入读取 findings JSON 并添加到图谱
    const baseDir = args[1];
    if (!baseDir) {
      console.error('Usage: kg add-findings <baseDir>');
      process.exit(1);
    }
    const resolvedBaseDir = path.resolve(baseDir);
    const kgm = new KnowledgeGraphManager('', resolvedBaseDir);
    kgm.load();

    let input = '';
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => {
      try {
        const findings = JSON.parse(input);
        const added = Array.isArray(findings) ? findings : [findings];
        for (const f of added) {
          if (f.label && f.source_nodes) {
            kgm.addFindingNode(f.label, f.source_nodes, {
              metadata: f.metadata,
              relations: f.relations,
            });
          }
        }
        kgm.save();
        console.log(`[KG] Added ${added.length} findings to graph`);
      } catch (e) {
        console.error('[KG] Error parsing findings JSON:', e);
        process.exit(1);
      }
    });
  } else if (command === 'new-topic') {
    const topic = args[1];
    if (!topic) {
      console.error('Usage: kg new-topic <topic_name>');
      process.exit(1);
    }
    const insightProbeRoot = path.resolve(__dirname, '..');
    const baseTempDir = path.join(insightProbeRoot, 'temp');
    const baseDir = createTopicStructure(baseTempDir, topic);
    const kgm = new KnowledgeGraphManager(topic, baseDir);
    kgm.addTopicNode(topic);
    kgm.save();
    console.log(`\n[KG] New topic: ${topic}`);
    console.log(`     Dir: ${baseDir}`);
    console.log(`\nNext: bun run kg stats ${baseDir}`);
  } else {
    console.log('Insight Probe - Knowledge Graph CLI\n');
    console.log('Usage:');
    console.log('  kg init <topic> [baseDir]        - Initialize a new graph');
    console.log('  kg new-topic <topic>              - Create topic (with dir structure)');
    console.log('  kg stats <baseDir>               - Show graph statistics');
    console.log('  kg next <baseDir>                - Derive next search directions');
    console.log('  kg analyze <baseDir> [--max <n>] - Analyze pages and extract findings');
    console.log('  kg mermaid <baseDir>             - Export Mermaid diagram');
    console.log('  kg image <baseDir>               - Export beautiful HTML knowledge graph image');
    console.log('  kg report <baseDir>              - Generate final comprehensive report');
    console.log('  kg research-record <baseDir>      - Generate research process record');
    console.log('  kg knowledge-list <baseDir>      - Generate knowledge list');
    console.log('  kg clean <baseDir> [--max-age <h>] - Clean expired temp files');
    console.log('\nExamples:');
    console.log('  kg new-topic "DeepSeek V4"');
    console.log('  kg stats ./temp/deepseek-v4_20260328120000');
    console.log('  kg next ./temp/deepseek-v4_20260328120000');
    console.log('  kg analyze ./temp/deepseek-v4_20260328120000 --max 5');
    console.log('  kg mermaid ./temp/deepseek-v4_20260328120000');
    console.log('  kg image ./temp/deepseek-v4_20260328120000');
    console.log('  kg report ./temp/deepseek-v4_20260328120000');
    console.log('  kg research-record ./temp/deepseek-v4_20260328120000');
    console.log('  kg knowledge-list ./temp/deepseek-v4_20260328120000');
    console.log('  kg clean ./temp/deepseek-v4_20260328120000');
    console.log('  kg clean ./temp/deepseek-v4_20260328120000 --max-age 48');
  }
}

// 如果直接运行（非 import）
if (process.argv[1]?.endsWith('knowledge-graph.ts')) {
  main().catch(console.error);
}
