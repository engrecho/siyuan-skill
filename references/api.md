# Kernel API 映射

核对来源：[思源官方 API 文档](https://github.com/siyuan-note/siyuan/blob/master/docs/API.md)，核对日期 2026-10-27。当前上游文档不代表已在某个指定部署版本上完成实测。

请求使用 POST、JSON 和 `Authorization: Token <token>`。返回 `{code,msg,data}`，只有 `code === 0` 才进入成功分支，成功也不保证索引或同步已全部完成。

| 命令 | `/api/` 后的端点 | 请求字段 / 返回数据 |
|---|---|---|
| version | system/version | `{}` / 版本字符串 |
| notebooks | notebook/lsNotebooks | `{}` / `{notebooks:[...]}` |
| docs / find / sql | query/sql | `{stmt}` / 记录数组 |
| new | filetree/createDocWithMd | `{notebook,path,markdown}` / 文档 ID |
| append | block/appendBlock | `{parentID,dataType:"markdown",data}` / 操作信息 |
| read | export/exportMdContent | `{id}` / `{hPath,content}` |
| rename | filetree/renameDoc | `{notebook,path,title}` / 通常为 null |
| rm | filetree/removeDoc | `{notebook,path}` / 通常为 null |

## 两类路径

新建接口 `path` 对应可读 `hpath`，如 `/工作/复盘`，斜杠代表层级。缺少父文档时接口可能自动创建父文档。用户标题包含字面斜杠时，先说明其会成为层级分隔符；需要保留标题语义时与用户确定替代字符。

删除和重命名接口的 `path` 是内部存储路径，如 `/20261027000001-abcdefg.sy` 或多层 ID 路径，从 `blocks.path` 获取。不要把显示标题直接拼成内部路径。思源文件以 ID 命名，不是按标题命名。

## 查询与一致性

`blocks` 中 `type='d'` 表示文档，`box` 是笔记本 ID，`root_id` 将内容块映射到文档。CLI 搜索一次查询返回匹配文档的定位字段，不逐篇导出全文。关键词中的单引号按 SQL 字符串规则转义，`%`、`_` 和反斜杠作为字面字符搜索。

创建前查询仅用于发现已有目标；索引延迟和并发仍可能影响结果。不要由一次 SQL 查不到结果推断文档丢失。写入发生超时后，先读取当前状态，不能无条件重复追加。

HTTP 错误和业务错误用非零退出码返回。错误输出只包含状态码或固定提示，避免把服务器回显中的凭据带入日志。需要深入排障时在用户自己的环境检查服务端日志，而不是输出完整请求头。
