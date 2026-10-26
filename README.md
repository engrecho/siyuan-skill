# 思源笔记 Skill

通过思源 Kernel HTTP API 搜索、读取、新建、追加、重命名和删除文档。支持 Node.js 18+，无第三方运行依赖，适用于 Windows、macOS 和 Linux。Agent 入口为 [SKILL.md](SKILL.md)。

## 安装与配置

将此目录复制到 Agent 的 skills 目录，例如 Codex 的 `~/.codex/skills/siyuan-note`。脚本在其所在技能目录运行，不依赖当前笔记工作区。

在思源设置中查看 API Token。在本机终端交互输入，避免将真实 Token 写进脚本、命令历史或聊天记录。

PowerShell：

```powershell
$env:SIYUAN_API = 'http://127.0.0.1:6806/api'
$secret = Read-Host 'SiYuan API Token' -AsSecureString
$env:SIYUAN_TOKEN = [System.Net.NetworkCredential]::new('', $secret).Password
node scripts/siyuan.mjs version
```

Bash：

```bash
export SIYUAN_API='http://127.0.0.1:6806/api'
read -rsp 'SiYuan API Token: ' SIYUAN_TOKEN; echo
export SIYUAN_TOKEN
node scripts/siyuan.mjs version
```

远程实例使用 HTTPS。环境变量仍可被同用户进程读取，不是凭据保险库；完成操作后可清除当前会话中的变量。旧版文档曾包含明文凭据，使用过原版的用户应在实例端轮换 Token。

## 使用

```text
node scripts/siyuan.mjs notebooks
node scripts/siyuan.mjs docs <notebook-id>
node scripts/siyuan.mjs find "项目复盘"
node scripts/siyuan.mjs new <notebook-id> /工作/复盘 ./note.md
node scripts/siyuan.mjs append <doc-id> ./more.md
node scripts/siyuan.mjs read <doc-id>
node scripts/siyuan.mjs rename <notebook-id> /内部路径.sy 新标题
node scripts/siyuan.mjs rm <notebook-id> /内部路径.sy --confirm
```

`scripts/siyuan.sh` 保留为 Bash 入口，但同样需要 Node.js。删除参数顺序已统一为“笔记本 ID、内部路径、确认标记”，不兼容旧版的 `rm <hpath> <notebookId>`。原 `scripts/find.py` 已由统一 CLI 取代。

新建会先查询同笔记本、同显示路径的已有文档，存在时返回 `created:false`。并发写入或索引延迟仍可能导致重复，不能把该检查视为服务端幂等键。追加只调用 `appendBlock`。写入超时不自动重试，应先读取核实。

`docs` / `find` 最多返回 200 条。`sql` 仅接受单条 SELECT；这是方便查询的限制，不是针对恶意 SQL 的安全沙箱。CLI 校验 HTTP 状态及业务 `code`，失败退出码为 1。详情见 [接口说明](references/api.md)。

## 验证与本次优化

运行 `npm test`。测试使用本地模拟服务，不需要真实 Token，也不写入真实笔记。尚未对用户的线上实例执行读写验收。

- 清除硬编码凭据和私人默认地址。
- 修正删除/重命名的内部路径语义，新增删除确认开关。
- 统一 JSON 编码、SQL 字面值转义、错误处理和超时。
- 消除 Bash/Python 混用和搜索逐文档导出的请求开销。
- 实现创建前精确查重，保留追加接口，补充重命名命令。
- 移除未经验证的“同名必定破坏索引”结论和直接停止内核、移动数据库的修复命令。

公开发布不包含任何个人实例配置。上游 API 可能随版本变化，升级思源后应先验证版本和只读命令。
