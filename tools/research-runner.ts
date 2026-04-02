/**
 * Insight Probe - Research Runner (数据采集器)
 *
 * 只负责：搜索 → 抓取 → 保存原始页面
 * 分析和提取由 LLM 执行（见 skill.md）
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { KnowledgeGraphManager, slugify } from './knowledge-graph.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ 配置 ============

const config = {
  searxng: {
    endpoint: 'http://127.0.0.1:10086',
  },
  research: {
    maxRounds: 10,
    queriesPerRound: 8,
    pagesPerRound: 5,
  },
};

// ============ 工具函数 ============

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

/**
 * Shell 转义函数 - 防止命令注入
 */
function shellEscape(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

type CmdResult =
  | { success: true; stdout: string; stderr: string }
  | { success: false; error: string; code?: number };

async function runCmd(cmd: string, timeout: number = 30000): Promise<CmdResult> {
  try {
    const fullCmd = cmd.endsWith('2>/dev/null') ? cmd : `${cmd} 2>/dev/null`;
    const { stdout, stderr } = await execAsync(fullCmd, { timeout, maxBuffer: 10 * 1024 * 1024 });
    if (stderr && stderr.trim()) {
      console.log(`  [stderr]: ${stderr.substring(0, 200)}`);
    }
    return { success: true, stdout, stderr };
  } catch (e: any) {
    const code = e.code;
    const message = e.message || String(e);
    if (code === 'ETIMEDOUT' || code === 'ETIMEDOUT2' || message.includes('timeout')) {
      console.log(`  [runCmd timeout]: ${message.substring(0, 200)}`);
    } else if (message.includes('ENOENT')) {
      console.log(`  [runCmd not found]: command not found`);
    } else {
      console.log(`  [runCmd error]: ${message.substring(0, 200)}`);
    }
    return { success: false, error: message, code };
  }
}

// ============ 搜索模块 ============

async function searchSearxng(query: string, topicDir: string, round: number, qIdx: number) {
  const outputFile = path.join(topicDir, 'search_results', `r${round}_q${qIdx}_searxng.json`);
  const url = `${config.searxng.endpoint}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,wikipedia`;

  await runCmd(`curl -s "${url}" -o "${outputFile}" --max-time 30`);

  if (fs.existsSync(outputFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      return data.results || [];
    } catch {
      return [];
    }
  }
  return [];
}

async function searchOpencli(site: string, query: string, topicDir: string, round: number, qIdx: number) {
  const safeSite = slugify(site);
  const outputFile = path.join(topicDir, 'search_results', `r${round}_q${qIdx}_${safeSite}.json`);
  const escapedQuery = shellEscape(query);

  const siteCommands: Record<string, string> = {
    wikipedia: `opencli wikipedia search "${escapedQuery}" --lang zh --limit 5 -f json`,
    wikipedia_en: `opencli wikipedia search "${escapedQuery}" --lang en --limit 5 -f json`,
    zhihu: `opencli zhihu search "${escapedQuery}" --limit 5 -f json`,
    bilibili: `opencli bilibili search "${escapedQuery}" --limit 5 -f json`,
    weibo: `opencli weibo search "${escapedQuery}" --limit 5 -f json`,
    hackernews: `opencli hackernews search "${escapedQuery}" --limit 5 -f json`,
    reddit: `opencli reddit search "${escapedQuery}" --limit 5 -f json`,
    arxiv: `opencli arxiv search "${escapedQuery}" --limit 5 -f json`,
  };

  const cmd = siteCommands[site];
  if (!cmd) return [];

  const result = await runCmd(cmd, 60000);
  if (result.success && result.stdout) {
    fs.writeFileSync(outputFile, result.stdout);
    try {
      return JSON.parse(result.stdout);
    } catch {
      return [];
    }
  }
  return [];
}

async function searchAll(query: string, topicDir: string, round: number, qIdx: number) {
  log(`  Searching: ${query}`);

  const sites = [
    'wikipedia', 'zhihu', 'bilibili', 'weibo',
    'wikipedia_en', 'hackernews', 'reddit', 'arxiv',
  ];

  const promises = sites.map(site => searchOpencli(site, query, topicDir, round, qIdx));
  const searxngPromise = searchSearxng(query, topicDir, round, qIdx);

  const [searxngResults, ...opencliResults] = await Promise.all([searxngPromise, ...promises]);

  return [searxngResults, ...opencliResults].flat().filter(Boolean);
}

// ============ 页面抓取 ============

async function fetchPage(url: string, topicDir: string, label: string): Promise<string | null> {
  const safeLabel = slugify(label).substring(0, 50);
  const outputDir = path.join(topicDir, 'pages', safeLabel);

  try {
    log(`    Fetching: ${url}`);
    const escapedUrl = shellEscape(url);
    const cmd = `opencli web read --url "${escapedUrl}" --output "${outputDir}" -f json`;
    const result = await runCmd(cmd, 90000);

    if (!result.success) {
      log(`    opencli failed, trying curl fallback...`);
      return await fetchPageWithCurl(url, topicDir, safeLabel);
    }

    const stdout = result.stdout;
    if (!stdout || stdout.trim() === '') {
      log(`    Empty result for ${url}`);
      return null;
    }

    const json = JSON.parse(stdout);
    if (json[0]?.status === 'success') {
      const mdFile = findMdFile(outputDir);
      if (mdFile) {
        log(`    Saved: ${mdFile}`);
        return mdFile;
      }
      log(`    No .md file found in ${outputDir}`);
    } else {
      log(`    Status not success: ${JSON.stringify(json[0])}`);
    }
  } catch (e) {
    log(`    Fetch failed: ${e}`);
  }
  return null;
}

async function fetchPageWithCurl(url: string, topicDir: string, safeLabel: string): Promise<string | null> {
  const outputFile = path.join(topicDir, 'pages', `${safeLabel}.txt`);

  try {
    const result = await runCmd(
      `curl -sL -A "InsightProbe/1.0" -m 30 "${shellEscape(url)}" -o "${outputFile}"`,
      35000
    );

    if (result.success && fs.existsSync(outputFile)) {
      const stat = fs.statSync(outputFile);
      if (stat.size > 500) {
        log(`    curl fallback: ${outputFile}`);
        return outputFile;
      }
    }
  } catch (e) {
    log(`    curl fallback failed: ${e}`);
  }
  return null;
}

function findMdFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.md')) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findMdFile(fullPath);
      if (found) return found;
    }
  }
  return null;
}

// ============ 页面质量评分 ============

const LOW_QUALITY_DOMAINS = [
  'instagram.com', 'tiktok.com', 'youtube.com', 'twitter.com', 'facebook.com',
  'reddit.com', 'baidu.com', 'microsoft.com', 'apple.com', 'amazon.com',
  'uptodown.com', 'softonic.com', 'wps.cn', 'cnki.net', 'wanfangdata.com',
];

function isLowQualityUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return LOW_QUALITY_DOMAINS.some(d => lower.includes(d));
}

const DOMAIN_WEIGHTS: Record<string, number> = {
  'wikipedia.org': 0.95, 'wikimedia.org': 0.9,
  'arxiv.org': 0.95, 'nih.gov': 0.9, 'gov': 0.85, 'edu': 0.85,
  'zhihu.com': 0.6, 'worldjournal.com': 0.75, 'mingpao.com': 0.7,
  'rfi.fr': 0.7, 'bbc.com': 0.8, 'reuters.com': 0.8, 'apnews.com': 0.8,
  'blog': 0.35, 'twitter.com': 0.3, 'weibo.com': 0.35, 'bilibili.com': 0.4,
};

function scoreUrl(url: string): number {
  if (isLowQualityUrl(url)) return 0;

  const lower = url.toLowerCase();
  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    if (lower.includes(domain)) return weight;
  }
  return 0.5;
}

function rankUrls(urlResults: Array<{ url: string; result: any }>) {
  return urlResults
    .map(({ url, result }) => ({ url, result, score: scoreUrl(url) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ============ 主研究循环 ============

interface PageManifest {
  topic: string;
  round: number;
  timestamp: string;
  pages: Array<{
    url: string;
    file: string;
    score: number;
    query: string;
  }>;
}

async function runResearch(topicDir: string) {
  log(`Starting research: ${topicDir}`);

  const kgm = new KnowledgeGraphManager('', topicDir);
  const kg = kgm.load();

  // 收集所有查询
  const allQueries: Array<{ query: string; reason: string; round: number }> = [];
  // 收集所有页面清单
  const allPages: PageManifest['pages'] = [];

  for (let round = 1; round <= config.research.maxRounds; round++) {
    log(`\n=== Round ${round} ===`);

    const queries = kgm.deriveNextQueries(config.research.queriesPerRound, round);

    if (round === 1 && queries.length === 0) {
      queries.push({
        query: kg.topic,
        reason: '种子查询',
        sourceNodeId: 'topic_root',
        sourceType: 'question' as const,
      });
    }

    if (queries.length === 0) {
      log('No more queries. Converged!');
      break;
    }

    log(`Derived ${queries.length} queries`);

    // 搜索
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      const queryNode = kgm.addSearchQueryNode(q.query, q.query, round, 0, ['searxng', 'opencli']);
      allQueries.push({ query: q.query, reason: q.reason, round });

      const results = await searchAll(q.query, topicDir, round, i + 1);

      // URL 去重 + 评分
      const urlMap = new Map<string, any>();
      for (const result of results) {
        const url = result.url || result.link || result.href || '';
        if (url && !urlMap.has(url) && url.startsWith('http')) {
          urlMap.set(url, result);
        }
      }

      const rankedUrls = rankUrls(Array.from(urlMap.entries()).map(([url, result]) => ({ url, result })));
      log(`Found ${rankedUrls.length} URLs for "${q.query}"`);

      // 抓取页面
      let fetchCount = 0;
      for (const { url, result, score } of rankedUrls) {
        if (fetchCount >= config.research.pagesPerRound) break;
        fetchCount++;

        log(`  [${score.toFixed(2)}] ${url.substring(0, 80)}`);
        const label = result.title || result.name || url;
        const fetchedFile = await fetchPage(url, topicDir, label);

        if (fetchedFile) {
          // 关键修复：将页面节点注册到图谱
          kgm.addWebpageNode(label, url, {
            fetched: true,
            file: fetchedFile,
            score,
            sourceQueryId: queryNode.id,
          });
          kgm.save(); // 每次添加页面后立即保存，确保数据不丢失

          // 记录到清单
          allPages.push({
            url,
            file: fetchedFile,
            score,
            query: q.query,
          });
        }
      }
    }

    kgm.save();
  }

  // 生成页面清单
  const manifest: PageManifest = {
    topic: kg.topic,
    round: config.research.maxRounds,
    timestamp: new Date().toISOString(),
    pages: allPages,
  };

  const manifestFile = path.join(topicDir, 'pages_manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8');

  log(`\n=== Research Complete ===`);
  log(`Collected ${allPages.length} pages from ${allQueries.length} queries`);
  log(`Manifest: ${manifestFile}`);
  log(`\nNext: Agent should read pages and run LLM analysis (see skill.md Step 5)`);

  return { kgm, manifest };
}

// ============ CLI ============

const args = process.argv.slice(2);
const command = args[0];

if (command === 'run') {
  const topicDir = args[1];
  if (!topicDir) {
    console.error('Usage: bun run research-runner.ts run <topic_dir> [--analyze]');
    process.exit(1);
  }
  const autoAnalyze = args.includes('--analyze');

  runResearch(topicDir).then(async ({ manifest }) => {
    if (autoAnalyze) {
      log(`\n=== Auto-analyzing pages ===`);
      // 动态导入 knowledge-graph 以避免循环依赖
      const { KnowledgeGraphManager, analyzePageContent } = await import('./knowledge-graph.js');
      const kgm = new KnowledgeGraphManager('', topicDir);
      kgm.load();

      // 获取需要分析的页面
      const analyzedUrls = new Set(
        kgm.kg.nodes
          .filter(n => n.type === 'webpage' && n.key_findings && n.key_findings.length > 0)
          .map(n => n.url)
      );

      const pagesToAnalyze = manifest.pages.filter((p: any) => !analyzedUrls.has(p.url));

      if (pagesToAnalyze.length === 0) {
        log(`No new pages to analyze.`);
        return;
      }

      log(`Found ${pagesToAnalyze.length} pages to analyze`);

      for (let i = 0; i < Math.min(pagesToAnalyze.length, 5); i++) {
        const page = pagesToAnalyze[i];
        log(`Analyzing (${i + 1}/${Math.min(pagesToAnalyze.length, 5)}): ${page.url.substring(0, 50)}...`);

        try {
          const contentPath = page.file;
          if (!fs.existsSync(contentPath)) continue;

          const content = fs.readFileSync(contentPath, 'utf-8');
          const pageTitle = page.url.split('/').pop() || page.url;
          const analysis = analyzePageContent(content, pageTitle, page.url);

          for (const finding of analysis.findings) {
            kgm.addFindingNode(finding.fact, [], {
              metadata: {
                entities: analysis.entities,
                relations: analysis.relations,
                sourceUrl: page.url,
                round: 1,
              }
            });
          }

          for (const q of analysis.followupQuestions) {
            kgm.addQuestionNode(q);
          }

          const webpageNode = kgm.kg.nodes.find(n => n.type === 'webpage' && n.url === page.url);
          if (webpageNode) {
            webpageNode.key_findings = analysis.findings.map(f => f.fact.substring(0, 50));
          }

          kgm.save();
          log(`  Added ${analysis.findings.length} findings, ${analysis.followupQuestions.length} questions`);
        } catch (err) {
          log(`  Error: ${err}`);
        }
      }

      log(`\nAuto-analysis complete`);
      log(`Run 'bun run kg:stats ${topicDir}' to see updated graph.`);
    }
  }).catch(console.error);
} else {
  console.log('Insight Probe - Research Runner (数据采集器)');
  console.log('Usage: bun run research-runner.ts run <topic_dir>');
  console.log('Example: bun run research-runner.ts run ./temp/美索不达米亚文明神话_202603281852');
}
