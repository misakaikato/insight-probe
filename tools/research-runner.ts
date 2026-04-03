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

// ============ 配置（从 config.json 统一读取） ============

interface SiteConfig {
  name: string;
  label: string;
  command: string;
  lang?: string;
  browser?: boolean;
  note?: string;
}

const projectRoot = path.resolve(__dirname, '..');
const configRaw = JSON.parse(fs.readFileSync(path.join(projectRoot, 'config.json'), 'utf-8'));

const config = {
  searxng: configRaw.tools.searxng,
  opencli: configRaw.tools.opencli,
  research: {
    maxRounds: configRaw.research.max_rounds,
    queriesPerRound: configRaw.research.queries_per_round,
    stopOnNoNewFindings: configRaw.research.stop_on_no_new_findings,
    pagesPerRound: configRaw.crawler?.max_pages_per_round || 5,
  },
  searchableSites: (configRaw.tools.opencli.sites as SiteConfig[]).filter(
    (s) => s.command.includes('{query}') && !s.note?.includes('仅搜索股票')
  ),
};

// ============ 工具函数 ============

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

/**
 * Shell 转义函数 - 防止命令注入
 * 处理双引号字符串中的特殊字符
 */
function shellEscape(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\n/g, ' ');
}

type CmdResult =
  | { success: true; stdout: string; stderr: string }
  | { success: false; error: string; code?: number };

// 浏览器站点健康状态追踪
const browserSiteHealth = new Map<string, { checked: boolean; healthy: boolean; reason?: string }>();

/**
 * 检查浏览器站点连通性（通过 opencli doctor）
 * 每次研究开始时自动调用，诊断 browser: true 站点的状态
 */
async function checkBrowserSitesHealth(): Promise<void> {
  log('Checking browser sites connectivity...');

  // 先用 opencli doctor 做整体检查
  const doctorResult = await runCmd('opencli doctor', 30000);

  if (!doctorResult.success) {
    log(`  opencli doctor failed: ${doctorResult.error?.substring(0, 100)}`);
  } else {
    // doctor 成功不代表所有站点都健康，解析输出
    const output = doctorResult.stdout || '';
    if (output.includes('error') || output.includes('fail') || output.includes('unauthorized')) {
      log(`  opencli doctor reports issues: ${output.substring(0, 200)}`);
    }
  }

  // 对每个 browser: true 站点做探测
  const browserSites = config.searchableSites.filter(s => s.browser);
  for (const site of browserSites) {
    const siteName = site.name;
    // 构造探测命令：用空查询看是否返回认证错误
    const probeQuery = 'test_probe_query_' + Date.now();
    const probeCmd = site.command.replace('{query}', probeQuery).replace(/--limit \d+/, '--limit 1');
    const result = await runCmd(probeCmd, 15000);

    if (result.success) {
      browserSiteHealth.set(siteName, { checked: true, healthy: true });
    } else {
      const error = result.error || '';
      let reason = 'unknown';
      if (error.includes('unauthorized') || error.includes('login') || error.includes('登录')) {
        reason = 'requires_login';
      } else if (error.includes('browser') || error.includes('session') || error.includes('headless')) {
        reason = 'browser_session_error';
      } else if (error.includes('timeout')) {
        reason = 'timeout';
      }
      browserSiteHealth.set(siteName, { checked: true, healthy: false, reason });
      log(`  Browser site unhealthy: ${siteName} (${reason})`);
    }
  }
}

/**
 * 检查站点是否可用（browser: true 站点会动态检测）
 */
function isSiteAvailable(site: SiteConfig): boolean {
  if (!site.browser) return true;
  const health = browserSiteHealth.get(site.name);
  // 未检查过 → 可用（让它实际执行一次）
  // 检查过且健康 → 可用
  // 检查过且不健康 → 跳过
  return !health || health.healthy;
}

/**
 * 标记站点为不健康（当实际调用失败时）
 */
function markSiteUnhealthy(siteName: string, reason: string): void {
  const existing = browserSiteHealth.get(siteName);
  if (!existing?.checked) {
    browserSiteHealth.set(siteName, { checked: true, healthy: false, reason });
  }
}

// 错误统计
const errorStats = {
  total: 0,
  failed: 0,
  timeouts: 0,
  notFound: 0,
};

function logError(type: 'timeout' | 'notfound' | 'other', site: string, msg: string) {
  errorStats.total++;
  errorStats.failed++;
  if (type === 'timeout') errorStats.timeouts++;
  if (type === 'notfound') errorStats.notFound++;

  const prefix = type === 'timeout' ? '[TEOUT]' : type === 'notfound' ? '[NOTFND]' : '[ERROR]';
  // 只在第一次失败时打印，避免刷屏
  if (errorStats.failed <= 5) {
    console.log(`  ${prefix} ${site}: ${msg.substring(0, 100)}`);
  }
}

async function runCmd(cmd: string, timeout: number = 30000): Promise<CmdResult> {
  // 不再使用 2>/dev/null，让错误信息可见
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout, maxBuffer: 10 * 1024 * 1024 });
    if (stderr && stderr.trim()) {
      // 只在 stderr 包含错误关键词时显示
      const lower = stderr.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('exception')) {
        if (errorStats.failed < 3) {
          console.log(`  [stderr]: ${stderr.substring(0, 150)}`);
        }
      }
    }
    return { success: true, stdout, stderr };
  } catch (e: any) {
    const code = e.code;
    const message = e.message || String(e);
    if (code === 'ETIMEDOUT' || code === 'ETIMEDOUT2' || message.includes('timeout')) {
      logError('timeout', 'cmd', message);
    } else if (message.includes('ENOENT')) {
      logError('notfound', 'cmd', 'command not found');
    } else {
      logError('other', 'cmd', message);
    }
    return { success: false, error: message, code };
  }
}

// ============ 搜索模块 ============

async function searchSearxng(query: string, topicDir: string, round: number, qIdx: number) {
  const outputFile = path.join(topicDir, 'search_results', `r${round}_q${qIdx}_searxng.json`);
  const engines = (config.searxng.engines || []).join(',');
  const categories = (config.searxng.categories || []).join(',');
  const url = `${config.searxng.endpoint}/search?q=${encodeURIComponent(query)}&format=json&engines=${engines}&categories=${categories}`;

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

async function searchOpencli(siteConfig: SiteConfig, query: string, topicDir: string, round: number, qIdx: number) {
  const safeSite = slugify(siteConfig.name);
  const outputFile = path.join(topicDir, 'search_results', `r${round}_q${qIdx}_${safeSite}.json`);
  const escapedQuery = shellEscape(query);

  const cmd = siteConfig.command.replace('{query}', escapedQuery);

  const result = await runCmd(cmd, config.opencli.timeout || 30000);
  if (result.success && result.stdout) {
    fs.writeFileSync(outputFile, result.stdout);
    try {
      return JSON.parse(result.stdout);
    } catch {
      return [];
    }
  }

  // 如果 browser 站点失败，标记为不健康
  if (siteConfig.browser && !result.success) {
    const error = result.error || '';
    let reason = 'unknown';
    if (error.includes('unauthorized') || error.includes('login') || error.includes('登录')) {
      reason = 'requires_login';
    } else if (error.includes('browser') || error.includes('session')) {
      reason = 'browser_session_error';
    } else if (error.includes('timeout')) {
      reason = 'timeout';
    }
    markSiteUnhealthy(siteConfig.name, reason);
  }

  return [];
}

async function searchAll(query: string, topicDir: string, round: number, qIdx: number) {
  log(`  Searching: ${query}`);

  // 过滤掉已知不健康的 browser 站点
  const availableSites = config.searchableSites.filter(isSiteAvailable);
  const skippedSites = config.searchableSites.filter(s => !isSiteAvailable(s));

  if (skippedSites.length > 0) {
    log(`    Skipping unhealthy sites: ${skippedSites.map(s => s.label).join(', ')}`);
  }

  const promises = availableSites.map(site => searchOpencli(site, query, topicDir, round, qIdx));
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
    const cmd = `opencli web fetch --url "${escapedUrl}" --output "${outputDir}" -f json`;
    const result = await runCmd(cmd, 90000);

    if (!result.success) {
      log(`    opencli web fetch failed: ${result.error?.substring(0, 100)}`);
      return null;
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

/**
 * URL 语言/版本归一化：提取基础 URL
 * 例如：
 *   https://zh.wikipedia.org/zh-cn/xxx -> https://zh.wikipedia.org/wiki/xxx
 *   https://ja.wikipedia.org/wiki/xxx -> https://zh.wikipedia.org/wiki/xxx (日文版归一到中文版)
 *   https://zh.wikipedia.org/zh-tw/xxx -> https://zh.wikipedia.org/wiki/xxx
 */
function normalizeUrl(url: string): string {
  // Wikipedia 多语言版本归一化
  const wikiMatch = url.match(/^(https?:\/\/(?:[a-z]{2})\.wikipedia\.org\/(?:[a-z]{2}(?:-[a-z]{2})?)\/)/);
  if (wikiMatch) {
    const lang = wikiMatch[1].match(/^https?:\/\/([a-z]{2})/)?.[1] || 'zh';
    // 将所有中文变体归一到 zh.wikipedia.org/wiki/
    if (lang === 'zh') {
      return url.replace(/^https?:\/\/[a-z]{2}\.wikipedia\.org\/(?:zh(?:-[a-z]{2})?)\//, 'https://zh.wikipedia.org/wiki/');
    }
    // 日文、英文等直接归一
    return url.replace(/^https?:\/\/[a-z]{2}\.wikipedia\.org\/[^/]+\//, `https://${lang}.wikipedia.org/wiki/`);
  }
  return url;
}

function rankUrls(urlResults: Array<{ url: string; result: any }>) {
  // 第一步：按归一化 URL 去重，保留得分最高的
  const normalizedMap = new Map<string, { url: string; result: any; score: number }>();

  for (const { url, result } of urlResults) {
    const score = scoreUrl(url);
    if (score <= 0) continue;

    const normalized = normalizeUrl(url);
    const existing = normalizedMap.get(normalized);

    if (!existing || score > existing.score) {
      normalizedMap.set(normalized, { url, result, score });
    }
  }

  // 第二步：按得分排序
  return Array.from(normalizedMap.values())
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

  // 预先检查 browser 站点连通性
  await checkBrowserSitesHealth();

  const kgm = new KnowledgeGraphManager('', topicDir);
  const kg = kgm.load();

  // 收集所有查询
  const allQueries: Array<{ query: string; reason: string; round: number }> = [];
  // 收集所有页面清单
  const allPages: PageManifest['pages'] = [];

  for (let round = 1; round <= config.research.maxRounds; round++) {
    log(`\n=== Round ${round} ===`);

    const queries = await kgm.deriveNextQueries(config.research.queriesPerRound, round);

    // 种子查询：只有第一轮且图谱为空时添加
    if (round === 1 && queries.length === 0) {
      // 检查图谱是否为空（图谱只有 topic_root 节点）
      const hasContent = kgm.kg.nodes.some(n =>
        n.type !== 'topic' && n.type !== 'search_query' && n.type !== 'webpage' && n.type !== 'finding'
      ) || kgm.kg.nodes.some(n => n.type === 'search_query' && n.query !== kg.topic);

      if (!hasContent) {
        queries.push({
          query: kg.topic,
          reason: '种子查询',
          sourceNodeId: 'topic_root',
          sourceType: 'question' as const,
        });
      }
    }

    if (queries.length === 0) {
      // 检查是否还有未探索的方向
      const unansweredQuestions = kgm.kg.nodes.filter(n =>
        n.type === 'question' && n.status === 'unanswered'
      );
      const unansweredQueryTexts = new Set(unansweredQuestions.map(q => q.label));
      const existingQueryTexts = new Set(
        kgm.kg.nodes
          .filter(n => n.type === 'search_query')
          .flatMap(n => [n.label, n.query].filter(Boolean))
      );

      // 有未回答的问题但查询文本重复了，尝试生成变体
      const existingQueries = kgm.kg.nodes.filter(n => n.type === 'search_query');
      if (existingQueries.length > 0 && unansweredQuestions.length > 0) {
        // 尝试为每个未回答问题生成变体查询
        for (const q of unansweredQuestions) {
          const variations = [
            `${q.label} 地质学证据`,
            `${q.label} 考古证据`,
            `${q.label} 历史研究`,
          ];
          for (const v of variations) {
            if (!existingQueryTexts.has(v)) {
              queries.push({
                query: v,
                reason: `未回答问题的变体: ${q.label}`,
                sourceNodeId: q.id,
                sourceType: 'question' as const,
              });
              break;
            }
          }
          if (queries.length > 0) break;
        }
      }

      if (queries.length === 0) {
        log('No more queries. Converged!');
        break;
      }
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

  // 打印命令执行统计
  if (errorStats.total > 0) {
    console.log(`\n[Stats] Commands: ${errorStats.total} total, ${errorStats.failed} failed (${errorStats.timeouts} timeouts, ${errorStats.notFound} not found)`);
  }

  log(`\nNext: Agent should analyze pages using 'bun run kg analyze ${topicDir}'`);

  return { kgm, manifest };
}

// ============ CLI ============

const args = process.argv.slice(2);
const command = args[0];

if (command === 'run') {
  const runIdx = args.indexOf('run');
  const analyzeIdx = args.indexOf('--analyze');
  const topicDir = runIdx >= 0 ? args[runIdx + 1] : args[1];

  if (!topicDir) {
    console.error('Usage: bun run research-runner.ts run <topic_dir> [--analyze]');
    console.error('Example: bun run research-runner.ts run ./temp/美索不达米亚文明神话_202603281852 --analyze');
    process.exit(1);
  }

  const shouldAnalyze = analyzeIdx >= 0;

  runResearch(topicDir, shouldAnalyze).then(({ manifest }) => {
    log(`\n=== Research Complete ===`);
    log(`Collected ${manifest.pages.length} pages`);
    log(`Manifest: ${path.join(topicDir, 'pages_manifest.json')}`);
    if (shouldAnalyze) {
      log(`\nNote: --analyze is not yet fully implemented.`);
      log(`Agent should analyze pages using: bun run kg analyze ${topicDir}`);
    } else {
      log(`\nNext: bun run kg analyze ${topicDir}`);
    }
  }).catch(console.error);
} else {
  console.log('Insight Probe - Research Runner (数据采集器)');
  console.log('Usage: bun run research-runner.ts run <topic_dir> [--analyze]');
  console.log('Example: bun run research-runner.ts run ./temp/美索不达米亚文明神话_202603281852');
  console.log('       bun run research-runner.ts run ./temp/美索不达米亚文明神话_202603281852 --analyze');
}
