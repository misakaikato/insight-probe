# 搜索来源参考

## 搜索优先级

**opencli search 站点优先，SearXNG 作为补充聚合来源。**

每次搜索必须并发执行所有可用来源，按以下优先级：

1. **opencli search 站点**（每个站点的 `search` 命令）
2. **SearXNG**（聚合 google/bing/wikipedia 等引擎）

## opencli 有 search 能力的站点（搜索必用）

### 中文

| 站点 | 命令 | 说明 |
|------|------|------|
| 维基百科 zh | `opencli wikipedia search "{q}" --lang zh --limit 5 -f json` | 百科 |
| 知乎 | `opencli zhihu search "{q}" --limit 5 -f json` | 问答社区 |
| 小红书 | `opencli xiaohongshu search "{q}" --limit 5 -f json` | 生活分享 |
| B站 | `opencli bilibili search "{q}" --limit 5 -f json` | 视频内容 |
| 微博 | `opencli weibo search "{q}" --limit 5 -f json` | 社交媒体 |
| 豆瓣电影 | `opencli douban search "{q}" --type movie --limit 5 -f json` | 影视评分 |
| 豆瓣图书 | `opencli douban search "{q}" --type book --limit 5 -f json` | 书籍评分 |

### 英文

| 站点 | 命令 | 说明 |
|------|------|------|
| Wikipedia en | `opencli wikipedia search "{q}" --lang en --limit 5 -f json` | 百科 |
| HackerNews | `opencli hackernews search "{q}" --limit 5 -f json` | 技术资讯 |
| Reddit | `opencli reddit search "{q}" --limit 5 -f json` | 社区讨论 |
| StackOverflow | `opencli stackoverflow search "{q}" --limit 5 -f json` | 技术问答 |
| ArXiv | `opencli arxiv search "{q}" --limit 5 -f json` | 学术论文 |

### 特殊（不可用于常规搜索）

| 站点 | 命令 | 限制 |
|------|------|------|
| V2EX | `opencli v2ex hot -f json` | **无 search 命令**，只能获取热门 |
| 雪球 | `opencli xueqiu search "{q}" --limit 5 -f json` | **仅搜股票** |

## SearXNG 配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| endpoint | `http://127.0.0.1:10086` | SearXNG 本地实例 |
| format | `json` | 返回格式 |
| timeout | `30000` | 超时毫秒 |
| engines | `google`, `bing`, `wikipedia` | 聚合引擎 |
| safe_search | `0` | 不过滤 |
| categories | `general`, `news`, `science` | 搜索分类 |

## opencli 站点列表

### 中文站点（`browser: true` 需浏览器 session）

| 站点 | 命令 | 说明 | 浏览器 |
|------|------|------|--------|
| 维基百科 zh | `opencli wikipedia search "{q}" --lang zh --limit 5 -f json` | 百科 | 是 |
| 知乎 | `opencli zhihu search "{q}" --limit 5 -f json` | 问答社区 | 是 |
| 小红书 | `opencli xiaohongshu search "{q}" --limit 5 -f json` | 生活分享 | 是 |
| B站 | `opencli bilibili search "{q}" --limit 5 -f json` | 视频内容 | 是 |
| 微博 | `opencli weibo search "{q}" --limit 5 -f json` | 社交媒体 | 是 |
| 豆瓣电影 | `opencli douban search "{q}" --type movie --limit 5 -f json` | 影视评分 | 是 |
| 豆瓣图书 | `opencli douban search "{q}" --type book --limit 5 -f json` | 书籍评分 | 是 |

### 英文站点（无需浏览器）

| 站点 | 命令 | 说明 |
|------|------|------|
| Wikipedia en | `opencli wikipedia search "{q}" --lang en --limit 5 -f json` | 百科 |
| HackerNews | `opencli hackernews search "{q}" --limit 5 -f json` | 技术资讯 |
| Reddit | `opencli reddit search "{q}" --limit 5 -f json` | 社区讨论 |
| StackOverflow | `opencli stackoverflow search "{q}" --limit 5 -f json` | 技术问答 |
| ArXiv | `opencli arxiv search "{q}" --limit 5 -f json` | 学术论文 |

### 特殊站点

| 站点 | 命令 | 说明 | 限制 |
|------|------|------|------|
| V2EX | `opencli v2ex hot -f json` | 热门话题 | **无 search 命令**，用 hot |
| 雪球 | `opencli xueqiu search "{q}" --limit 5 -f json` | 股票 | **仅搜股票**，不适用通用调研 |

## 主题类型与来源选择

| 主题类型 | 优先来源 |
|----------|----------|
| 通用/中文 | SearXNG + 中文 opencli 站点 |
| 技术/英文 | SearXNG + 英文 opencli 站点 |
| 财经/股票 | SearXNG + xueqiu |
| 生活/文化 | SearXNG + 知乎/小红书/微博/豆瓣/B站 |

> 首次使用 `browser: true` 站点前，必须运行 `opencli doctor` 检查连通性。
