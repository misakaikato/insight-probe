/**
 * Insight Probe - Knowledge Graph Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeGraphManager, slugify, generateTopicDirname, createTopicStructure } from './knowledge-graph';

function makeTestDir(): string {
  return '/tmp/kg-test-' + Math.random().toString(36).slice(2);
}

describe('slugify', () => {
  it('keeps Chinese characters', () => {
    expect(slugify('财胜意')).toBe('财胜意');
  });

  it('replaces spaces with dashes', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('hello!@#world')).toBe('helloworld');
  });

  it('trims and collapses dashes', () => {
    expect(slugify('  hello---world  ')).toBe('hello-world');
  });
});

describe('generateTopicDirname', () => {
  it('creates slug with timestamp', () => {
    const result = generateTopicDirname('财胜意');
    expect(result).toMatch(/^财胜意_\d{12}$/);
  });

  it('handles mixed content', () => {
    const result = generateTopicDirname('Hello World 2024');
    expect(result).toMatch(/^Hello-World-2024_\d{12}$/);
  });
});

describe('createTopicStructure', () => {
  const testDir = makeTestDir();

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates topic directory', () => {
    const topicDir = createTopicStructure(testDir, '测试主题');
    try {
      expect(fs.existsSync(topicDir)).toBe(true);
      expect(fs.statSync(topicDir).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(topicDir, { recursive: true, force: true });
    }
  });

  it('creates subdirectories', () => {
    const topicDir = createTopicStructure(testDir, '测试主题');
    try {
      expect(fs.existsSync(path.join(topicDir, 'pages'))).toBe(true);
      expect(fs.existsSync(path.join(topicDir, 'search_results'))).toBe(true);
      expect(fs.existsSync(path.join(topicDir, 'reports'))).toBe(true);
    } finally {
      fs.rmSync(topicDir, { recursive: true, force: true });
    }
  });

  it('returns absolute path', () => {
    const topicDir = createTopicStructure(testDir, '测试主题');
    try {
      expect(path.isAbsolute(topicDir)).toBe(true);
    } finally {
      fs.rmSync(topicDir, { recursive: true, force: true });
    }
  });
});

describe('KnowledgeGraphManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = makeTestDir();
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function freshKG(topic = '测试主题'): KnowledgeGraphManager {
    const kgm = new KnowledgeGraphManager(topic, testDir);
    kgm.addTopicNode(topic);
    kgm.save();
    return kgm;
  }

  describe('addTopicNode', () => {
    it('adds a topic node', () => {
      const kgm = freshKG();
      const stats = kgm.getStats();
      expect(stats.topic).toBe(1);
    });

    it('saves knowledge_graph.json', () => {
      freshKG();
      const kgFile = path.join(testDir, 'knowledge_graph.json');
      expect(fs.existsSync(kgFile)).toBe(true);
    });
  });

  describe('addQuestionNode', () => {
    it('adds a question node', () => {
      const kgm = freshKG();
      kgm.addQuestionNode('财胜意卖什么？');
      const stats = kgm.getStats();
      expect(stats.question).toBe(1);
    });

    it('defaults to unanswered status', () => {
      const kgm = freshKG();
      const q = kgm.addQuestionNode('测试问题');
      expect(q.status).toBe('unanswered');
    });
  });

  describe('addSearchQueryNode', () => {
    it('adds a search_query node', () => {
      const kgm = freshKG();
      kgm.addSearchQueryNode('财胜意是什么', '财胜意是什么', 1, 10, ['searxng', 'wikipedia']);
      const stats = kgm.getStats();
      expect(stats.search_query).toBe(1);
    });

    it('records sources', () => {
      const kgm = freshKG();
      const q = kgm.addSearchQueryNode('财胜意', '财胜意', 1, 10, ['searxng', 'zhihu']);
      expect(q.sources).toEqual(['searxng', 'zhihu']);
    });
  });

  describe('addFindingNode', () => {
    it('adds a finding node', () => {
      const kgm = freshKG();
      kgm.addFindingNode('财胜意是文创空间', [], { metadata: { entities: ['阿那亚', '财神'] } });
      const stats = kgm.getStats();
      expect(stats.finding).toBe(1);
    });

    it('stores metadata.entities', () => {
      const kgm = freshKG();
      const f = kgm.addFindingNode('发现', [], { metadata: { entities: ['实体A', '实体B'] } });
      expect((f.metadata?.entities as string[])).toEqual(['实体A', '实体B']);
    });
  });

  describe('addWebpageNode', () => {
    it('adds a webpage node', () => {
      const kgm = freshKG();
      kgm.addWebpageNode('测试页面', 'https://example.com');
      const stats = kgm.getStats();
      expect(stats.webpage).toBe(1);
    });

    it('marks as unfetched by default', () => {
      const kgm = freshKG();
      const w = kgm.addWebpageNode('测试', 'https://example.com');
      expect(w.fetched).toBe(false);
    });
  });

  describe('getUnansweredQuestions', () => {
    it('returns only unanswered questions', () => {
      const kgm = freshKG();
      kgm.addQuestionNode('问题1');
      const q2 = kgm.addQuestionNode('问题2');
      kgm.answerQuestion(q2.id, 'finding_0');

      const unanswered = kgm.getUnansweredQuestions();
      expect(unanswered.length).toBe(1);
      expect(unanswered[0].label).toBe('问题1');
    });
  });

  describe('deriveNextQueries', () => {
    it('returns unanswered questions as first priority', async () => {
      const kgm = freshKG();
      kgm.addQuestionNode('未回答问题');
      const queries = await kgm.deriveNextQueries(4);
      expect(queries.length).toBe(1);
      expect(queries[0].query).toBe('未回答问题');
      expect(queries[0].sourceType).toBe('question');
    });

    it('deduplicates against existing queries by label', async () => {
      const kgm = freshKG();
      kgm.addQuestionNode('已有查询');
      kgm.addSearchQueryNode('已有查询', '已有查询', 1, 5, ['searxng']);
      const queries = await kgm.deriveNextQueries(4);
      expect(queries.length).toBe(0);
    });

    it('deduplicates against existing queries by query field', async () => {
      const kgm = freshKG();
      kgm.addQuestionNode('新问题');
      kgm.addSearchQueryNode('另一个标签', '不同查询', 1, 5, ['searxng']);
      const queries = await kgm.deriveNextQueries(4);
      expect(queries.length).toBe(1);
      expect(queries[0].query).toBe('新问题');
    });

    it('derives queries from findings entities', async () => {
      // 从 findings 的实体推导查询（本地逻辑，无需 API）
      const kgm = freshKG();
      kgm.addFindingNode('发现1', [], { metadata: { entities: ['阿那亚', '北京'] } });
      const queries = await kgm.deriveNextQueries(4);
      // 有 findings 实体 → 返回实体作为查询
      expect(queries.length).toBeGreaterThan(0);
      expect(queries[0].sourceType).toBe('finding');
    });

    it('respects maxQueries limit', async () => {
      const kgm = freshKG();
      kgm.addQuestionNode('Q1');
      kgm.addQuestionNode('Q2');
      kgm.addQuestionNode('Q3');
      const queries = await kgm.deriveNextQueries(2);
      expect(queries.length).toBe(2);
    });

    it('returns questions in order when no API key', async () => {
      const kgm = freshKG();
      kgm.addQuestionNode('问题A');
      kgm.addQuestionNode('问题B');
      const queries = await kgm.deriveNextQueries(4);
      expect(queries.length).toBe(2);
      expect(queries[0].query).toBe('问题A');
      expect(queries[1].query).toBe('问题B');
    });
  });

  describe('isConverged', () => {
    it('returns true when no more queries possible', async () => {
      const kgm = freshKG();
      expect(await kgm.isConverged()).toBe(true);
    });

    it('returns false when unanswered questions exist', async () => {
      const kgm = freshKG();
      kgm.addQuestionNode('还有问题');
      expect(await kgm.isConverged()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns correct node counts', () => {
      const kgm = freshKG();
      kgm.addSearchQueryNode('查询1', '查询1', 1, 5, ['searxng']);
      kgm.addWebpageNode('页面1', 'https://a.com');
      kgm.addFindingNode('发现1', [], { metadata: { entities: [] } });
      kgm.addQuestionNode('问题1');
      const stats = kgm.getStats();
      expect(stats.topic).toBe(1);
      expect(stats.search_query).toBe(1);
      expect(stats.webpage).toBe(1);
      expect(stats.finding).toBe(1);
      expect(stats.question).toBe(1);
    });
  });

  describe('persistence', () => {
    it('loads existing graph on reinit', () => {
      const kgm1 = new KnowledgeGraphManager('测试', testDir);
      kgm1.addTopicNode('测试');
      kgm1.addQuestionNode('持久化问题');
      kgm1.addFindingNode('持久化发现', [], { metadata: { entities: ['测试'] } });
      kgm1.save();

      const kgm2 = new KnowledgeGraphManager('测试', testDir);
      const stats = kgm2.getStats();
      expect(stats.question).toBe(1);
      expect(stats.finding).toBe(1);
    });
  });

  describe('answerQuestion', () => {
    it('changes question status to answered', () => {
      const kgm = freshKG();
      const q = kgm.addQuestionNode('原始问题');
      kgm.answerQuestion(q.id, 'finding_0');
      const unanswered = kgm.getUnansweredQuestions();
      expect(unanswered.length).toBe(0);
    });
  });

  describe('getAllEntities', () => {
    it('collects entities from all nodes', () => {
      const kgm = freshKG();
      kgm.addFindingNode('发现1', [], { metadata: { entities: ['实体A', '实体B'] } });
      kgm.addFindingNode('发现2', [], { metadata: { entities: ['实体C'] } });
      const entities = kgm.getAllEntities();
      expect(entities).toContain('实体A');
      expect(entities).toContain('实体B');
      expect(entities).toContain('实体C');
    });
  });

  describe('toMermaid', () => {
    it('generates mermaid graph syntax', () => {
      const kgm = freshKG();
      kgm.addQuestionNode('测试问题');
      const mermaid = kgm.toMermaid();
      expect(mermaid).toContain('graph TD');
      expect(mermaid).toContain('topic_root');
      expect(mermaid).toContain('question_0');
    });
  });

  describe('clean', () => {
    it('deletes files older than maxAgeHours', () => {
      const kgm = freshKG();
      const srDir = path.join(testDir, 'search_results');
      fs.mkdirSync(srDir, { recursive: true });
      const oldFile = path.join(srDir, 'old_result.json');
      fs.writeFileSync(oldFile, '{}');
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);
      fs.utimesSync(oldFile, new Date(oldTime), new Date(oldTime));

      const result = kgm.clean(24);
      expect(result.deleted).toBe(1);
      expect(fs.existsSync(oldFile)).toBe(false);
    });

    it('keeps recent files', () => {
      const kgm = freshKG();
      const srDir = path.join(testDir, 'search_results');
      fs.mkdirSync(srDir, { recursive: true });
      const recentFile = path.join(srDir, 'recent.json');
      fs.writeFileSync(recentFile, '{}');

      const result = kgm.clean(24);
      expect(result.deleted).toBe(0);
      expect(fs.existsSync(recentFile)).toBe(true);
    });

    it('returns 0 when no files exist', () => {
      const kgm = freshKG();
      const result = kgm.clean(24);
      expect(result.deleted).toBe(0);
    });
  });
});
