#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function id(value) {
  if (!/^\d{14}-[a-z0-9]{7}$/.test(value || '')) throw new Error('无效的思源 ID');
  return value;
}
function internalPath(value) {
  if (!value?.startsWith('/') || !value.endsWith('.sy') || value.split('/').some(p => p === '..' || p === '.')) throw new Error('需要以 / 开头、.sy 结尾的内部 path；不能使用 hpath');
  return value;
}
export function createClient(env = process.env) {
  const base = new URL((env.SIYUAN_API || 'http://127.0.0.1:6806/api').replace(/\/+$/, '') + '/');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('SIYUAN_API 必须是无凭据或查询参数的 HTTP(S) 地址');
  if (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('非回环实例必须使用 HTTPS');
  if (!base.pathname.endsWith('/api/')) base.pathname += 'api/';
  const token = env.SIYUAN_TOKEN;
  if (!token) throw new Error('请在本机设置 SIYUAN_TOKEN');
  return async (endpoint, body = {}) => {
    let response;
    try {
      response = await fetch(new URL(endpoint, base), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { throw new Error('连接失败或超时；写入结果可能不确定，请先查询再决定是否重试'); }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let result;
    try { result = await response.json(); } catch { throw new Error('实例返回无效 JSON'); }
    if (result.code !== 0) throw new Error(`思源 API 错误（code=${result.code ?? 'missing'}）`);
    return result.data;
  };
}
const help = `思源笔记 CLI（Node.js 18+）
version | notebooks | docs <notebook-id> | find <关键词> | read <doc-id>
new <notebook-id> /路径/标题 <file.md> | append <doc-id> <file.md>
rename <notebook-id> /内部路径.sy 新标题 | rm <notebook-id> /内部路径.sy --confirm
sql <SELECT语句>
环境变量：SIYUAN_API、SIYUAN_TOKEN。详情见 SKILL.md。`;
export async function run(args, call) {
  const [cmd, ...a] = args;
  const counts = {version: 0, notebooks: 0, docs: 1, find: 1, read: 1, new: 3, append: 2, rename: 3, rm: 3, sql: 1};
  if (!Object.hasOwn(counts, cmd) || a.length !== counts[cmd]) throw new Error('命令或参数数量错误；运行 --help 查看用法');
  const sql = stmt => call('query/sql', {stmt});
  switch (cmd) {
    case 'version': return call('system/version');
    case 'notebooks': return call('notebook/lsNotebooks');
    case 'docs': return sql(`SELECT id, box, path, hpath FROM blocks WHERE type='d' AND box=${quote(id(a[0]))} ORDER BY hpath LIMIT 200`);
    case 'find': {
      if (!a[0].trim()) throw new Error('关键词不能为空');
      const pattern = quote('%' + a[0].replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') + '%');
      return sql(`SELECT id, box, path, hpath FROM blocks WHERE type='d' AND id IN (SELECT root_id FROM blocks WHERE content LIKE ${pattern} ESCAPE '\\' OR hpath LIKE ${pattern} ESCAPE '\\') ORDER BY hpath LIMIT 200`);
    }
    case 'read': return (await call('export/exportMdContent', {id: id(a[0])})).content;
    case 'new': {
      const notebook = id(a[0]), path = a[1];
      if (!path.startsWith('/') || path.endsWith('/') || path.split('/').some(p => p === '.' || p === '..')) throw new Error('新文档需要 /路径/标题');
      const markdown = await readFile(a[2], 'utf8');
      const existing = await sql(`SELECT id, box, path, hpath FROM blocks WHERE type='d' AND box=${quote(notebook)} AND hpath=${quote(path)} LIMIT 2`);
      if (!Array.isArray(existing)) throw new Error('查询结果格式错误');
      if (existing.length) return {created: false, existing};
      return {created: true, id: await call('filetree/createDocWithMd', {notebook, path, markdown})};
    }
    case 'append': return call('block/appendBlock', {parentID: id(a[0]), dataType: 'markdown', data: await readFile(a[1], 'utf8')});
    case 'rename': {
      if (!a[2].trim() || /[/\\]/.test(a[2])) throw new Error('标题不能为空或包含路径分隔符');
      return call('filetree/renameDoc', {notebook: id(a[0]), path: internalPath(a[1]), title: a[2]});
    }
    case 'rm': {
      if (a[2] !== '--confirm') throw new Error('删除需要明确授权，并传入 --confirm');
      return call('filetree/removeDoc', {notebook: id(a[0]), path: internalPath(a[1])});
    }
    case 'sql': {
      // Narrow query interface; this is not a general SQL security sandbox.
      const stmt = a[0].trim().replace(/;$/, '');
      if (!/^SELECT\s/i.test(stmt) || /;|--|\/\*|\b(load_extension|writefile|readfile)\s*\(/i.test(stmt)) throw new Error('仅支持单条 SELECT 查询');
      return sql(stmt);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!args.length || ['help', '--help', '-h'].includes(args[0])) console.log(help);
  else {
    try {
      const result = await run(args, createClient());
      console.log(typeof result === 'string' && args[0] === 'read' ? result : JSON.stringify(result, null, 2));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
