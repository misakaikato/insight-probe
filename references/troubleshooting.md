# 常见问题排查

## SearXNG 连接失败

**症状**: `curl` 返回空或超时

**排查步骤**:
1. 检查 SearXNG 服务是否运行：`curl -s http://127.0.0.1:10086`
2. 重启 SearXNG 服务
3. 确认端口 `10086` 未被占用

## opencli 站点返回空结果

**症状**: `opencli <site> search` 返回 `[]`

**排查步骤**:
1. 确认站点命令正确（参考 `references/search-sources.md`）
2. `browser: true` 的站点需先运行 `opencli doctor` 检查登录状态
3. 尝试用 `--limit 10` 增加结果数量

## 知识图谱加载失败

**症状**: `bun run kg stats` 报错或显示空图谱

**排查步骤**:
1. 确认 `knowledge_graph.json` 文件存在且格式正确
2. 检查 JSON 是否有效（无尾逗号等语法错误）
3. 备份后删除重建：`bun run kg new-topic "<同主题>"`

## V2EX 无 search 命令

**症状**: `opencli v2ex search "xxx"` 报错

**原因**: V2EX **没有** search 命令，只能用 `opencli v2ex hot` 获取热门话题

**正确用法**: `opencli v2ex hot -f json`

## 雪球搜索不适用

**症状**: 搜索通用话题返回空或无关结果

**原因**: 雪球**仅支持**股票代码/名称搜索，不适用于通用调研

## 调研收敛过快

**症状**: 仅 1-2 轮就 `isConverged = true`

**排查**:
1. 检查是否产生了 `finding` 节点且 `metadata.entities` 有实体
2. 检查是否有 `question` 节点状态为 `unanswered`
3. 确认 `deriveNextQueries` 正确推导了实体查询

## 页面抓取失败

**症状**: `curl` 超时或返回乱码

**解决方案**:
1. 增加超时时间：`--max-time 60`
2. 添加重试：最多 3 次
3. 对 `browser: true` 的站点，使用 opencli 专用命令获取内容
