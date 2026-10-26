import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir, writeFile, rm} from 'node:fs/promises';
import {createClient, run} from '../scripts/siyuan.mjs';

const nb = '20261027000000-abcdefg';
const doc = '20261027000001-abcdefg';
const dir = new URL('../.cache/tests/', import.meta.url);
test('CLI behavior against an isolated mock Kernel', async t => {
  await mkdir(dir, {recursive: true});
  const file = new URL('note.md', dir);
  await writeFile(file, '# 标题\n含 "引号"、反斜杠 \\ 与换行\n');
  t.after(() => rm(dir, {recursive: true, force: true}));
  const calls = [];
  let mode = 'normal', exists = false;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    calls.push({url: req.url, body, auth: req.headers.authorization});
    if (mode === 'http') {res.writeHead(401).end(); return;}
    if (mode === 'json') {res.end('not json'); return;}
    if (mode === 'business') {res.end(JSON.stringify({code: -1, msg: 'failure'})); return;}
    if (mode === 'redirect') {res.writeHead(302, {Location: '/redirected'}).end(); return;}
    let data = null;
    if (req.url === '/api/system/version') data = 'mock-version';
    if (req.url === '/api/query/sql') data = exists ? [{id: doc, hpath: '/工作/复盘'}] : [];
    if (req.url === '/api/filetree/createDocWithMd') data = doc;
    if (req.url === '/api/export/exportMdContent') data = {content: '# 原文\n正文'};
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({code: 0, msg: '', data}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
  const api = `http://127.0.0.1:${server.address().port}`;
  const call = createClient({SIYUAN_API: api, SIYUAN_TOKEN: 'mock-only'});

  await t.test('base URL and authentication', async () => {
    assert.equal(await run(['version'], call), 'mock-version');
    assert.equal(calls.at(-1).url, '/api/system/version');
    assert.equal(calls.at(-1).auth, 'Token mock-only');
    await run(['version'], createClient({SIYUAN_API: api + '/api/', SIYUAN_TOKEN: 'mock-only'}));
    assert.equal(calls.at(-1).url, '/api/system/version');
  });
  await t.test('UTF-8 JSON and create result', async () => {
    assert.deepEqual(await run(['new', nb, '/工作/复盘', file], call), {created:true, id:doc});
    assert.equal(calls.at(-1).body.markdown, '# 标题\n含 "引号"、反斜杠 \\ 与换行\n');
  });
  await t.test('existing document is not recreated or overwritten', async () => {
    exists = true;
    const start = calls.length;
    assert.equal((await run(['new', nb, '/工作/复盘', file], call)).created, false);
    assert.equal(calls.length - start, 1);
    assert.equal(calls.at(-1).url, '/api/query/sql');
    exists = false;
  });
  await t.test('append sends only the new content', async () => {
    const start = calls.length;
    await run(['append', doc, file], call);
    assert.equal(calls.length - start, 1);
    assert.equal(calls.at(-1).url, '/api/block/appendBlock');
    assert.equal(calls.at(-1).body.parentID, doc);
  });
  await t.test('read preserves Markdown', async () => assert.equal(await run(['read', doc], call), '# 原文\n正文'));
  await t.test('delete requires confirmation and internal path before any request', async () => {
    const start = calls.length;
    await assert.rejects(run(['rm', nb, '/标题'], call));
    await assert.rejects(run(['rm', nb, '/标题', '--confirm'], call));
    assert.equal(calls.length, start);
    await run(['rm', nb, `/${doc}.sy`, '--confirm'], call);
    assert.deepEqual(calls.at(-1).body, {notebook:nb, path:`/${doc}.sy`});
  });
  await t.test('rename uses title, notebook and internal path', async () => {
    await run(['rename', nb, `/${doc}.sy`, '新标题'], call);
    assert.equal(calls.at(-1).url, '/api/filetree/renameDoc');
    assert.equal(calls.at(-1).body.title, '新标题');
  });
  await t.test('invalid ID and write SQL are rejected without requests', async () => {
    const start = calls.length;
    for (const args of [['docs', "x' OR 1=1"], ['sql','DELETE FROM blocks'], ['sql','SELECT 1; DELETE FROM blocks'], ['unknown']]) await assert.rejects(run(args, call));
    assert.equal(calls.length, start);
  });
  await t.test('search escapes quotes and wildcard characters', async () => {
    await run(['find', "O'Reilly_100%"], call);
    assert.ok(calls.at(-1).body.stmt.includes("O''Reilly\\_100\\%"));
  });
  for (const failure of ['http','json','business','redirect']) {
    await t.test(`${failure} failure is surfaced without retry`, async () => {
      mode = failure;
      const start = calls.length;
      await assert.rejects(run(['version'], call));
      assert.equal(calls.length - start, 1);
      mode = 'normal';
    });
  }
  await t.test('credentials and remote plain HTTP rejected at setup', () => {
    assert.throws(() => createClient({}));
    assert.throws(() => createClient({SIYUAN_API:'http://example.com/api', SIYUAN_TOKEN:'mock-only'}));
    assert.throws(() => createClient({SIYUAN_API:'https://user:pass@example.com/api', SIYUAN_TOKEN:'mock-only'}));
  });
});
