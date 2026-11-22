// ./ci 里的机械检查：架构约定（AGENTS.md「架构约定」）里能机械查的那几条。
// 用法：node scripts/check.js <规则> [仓根]（仓根默认是本仓）。过了不出声、退出码 0；没过一行一处，退出码 1。
// 规则在下面的 RULES 里；./ci 跑哪几条看 checks/list。照 lifaninjp/finance 的 scripts/check.js。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (root, path) => readFileSync(join(root, path), 'utf8');
const filesIn = (root, dir, pattern) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir), { recursive: true }) : [])
  .filter((f) => pattern.test(f)).map((f) => join(dir, f));
const jsFiles = (root, dir) => filesIn(root, dir, /\.js$/);
// 去掉整行注释和块注释（注释里提到 process.env 不算用了它）
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// 依赖白名单：只有规则引擎；ts-fsrs（间隔复习）到用它的那张票再加进来
const ALLOWED_DEPS = new Set(['ocgcore-wasm']);
// 旧应用（2026-02 的 Next.js + Supabase + Cloudflare）不许回来
const LEGACY_FILES = ['next.config.ts', 'next.config.js', 'next.config.mjs', 'wrangler.toml', 'supabase', 'app', 'components', 'migrations', 'Dockerfile', 'docker-compose.yml'];
const LEGACY_DEPS = /^(next|react|react-dom|@supabase\/.*|wrangler|@cloudflare\/.*|tailwindcss|radix-ui)$/;

// src/ 里只有这几个文件碰外面的世界；别的模块是纯函数，「现在」、路径、卡库都由 server.js 传进去
const BOUNDARY = [
  { what: 'process.env', re: /\bprocess\.env\b/, only: ['src/server.js'], why: '环境变量只在 server.js 读，再作为参数传下去' },
  { what: 'Date.now()', re: /\bDate\.now\(/, only: ['src/server.js'], why: '「现在」只在 server.js 取，传给别的模块' },
  { what: 'new Date()', re: /\bnew Date\(\s*\)/, only: ['src/server.js'], why: '「现在」只在 server.js 取，传给别的模块' },
  { what: 'node:http / node:net', re: /['"]node:(http|net)['"]/, only: ['src/server.js'], why: '只有 server.js 开服务' },
  { what: 'node:fs / node:sqlite', re: /['"]node:(fs|fs\/promises|sqlite)['"]/, only: ['src/engine-files.js', 'src/store.js'], why: '读卡库和脚本只在 engine-files.js，写数据目录只在 store.js' },
  { what: '写文件（writeFile / appendFile / rename / rm / unlink / mkdir）', re: /\b(writeFile|appendFile|rename|rm|unlink|mkdir)(Sync)?\(/, only: ['src/store.js'], why: '数据目录只由 store.js 写' },
  { what: 'node:https / fetch', re: /['"]node:https['"]|\bfetch\(/, only: [], why: '服务不往外发请求：联网只有 scripts/prepare-engine.js 下载公开的引擎数据' },
  { what: 'node:child_process', re: /['"]node:child_process['"]/, only: [], why: '服务不起子进程' },
];

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

// 游戏王插件（plugin/，给 Hermes 网页工作区用）只做外壳：后端只把请求转给本机的服务，页面只经 ctx.rest 调本插件的后端（照 lifaninjp/finance）
const PLUGIN_JS = 'plugin/webapp/plugin.js';
const PLUGIN_API = 'plugin/dashboard/plugin_api.py';
const PLUGIN_MODULES = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']);
// 一个文件里 import / export … from 的模块名（含动态 import('…')）
const importsOf = (text) => [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
const stripPy = (text) => text.replace(/"""[\s\S]*?"""/g, '').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
// 后端不起子进程、不开别的连接，只有 urllib 转给 YUGIOH_URL（本机）；不读数据文件
const API_BAD = [
  [/^\s*(import\s+(subprocess|socket|ssl|requests|httpx|aiohttp|http\.client|ftplib|smtplib|pty|multiprocessing)\b|from\s+(subprocess|socket|ssl|requests|httpx|aiohttp|http\.client|ftplib|smtplib|pty|multiprocessing)\b)/m, '起子进程或另开网络连接'],
  [/\b(eval|exec|__import__|importlib|create_subprocess_\w+)\b/, '动态执行或起子进程'],
  [/\bos\.(system|popen|exec\w*|spawn\w*|fork)\(/, '起子进程'],
  [/\b(open|read_text|read_bytes)\(|\bPath\(/, '读文件：数据在服务那边，这里只转发'],
  [/https?:\/\/(?!127\.0\.0\.1\b|localhost\b|\[::1\])[\w.-]+/, '写了不是本机的地址'],
];
// 页面不自己发请求、不引外部东西；「场面估值」一类的字样展开中不许出现（规格 #1：展开中不显示离最好还差多少）
const PAGE_BAD = [
  [/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\bimport\s*\(/, '页面只经 ctx.rest 调本插件的后端，不自己发请求、不动态 import'],
  [/https?:\/\//, '页面里写了网址：不引外部字体、图片，不往外发请求'],
];
// 页面文字里不许出现的字样（样式表里的 100% 之类不算）：规格 #1 要保留解谜感，展开中不显示离最好还差多少
const PAGE_TEXT_BAD = /还差|估值|\d\s*%|百分/;
// 卡组数据（src/decks/）里的出处链接是引用，不是请求；服务不发请求由 boundary 的 node:https / fetch 规则兜着，对 src/ 下所有文件都生效
const OUTBOUND_EXEMPT = /^src\/decks\//;
// 线上的东西：常驻服务的端口、tailnet 地址、真实数据目录
const LIVE = [/\b4519\b/, /mini\.tail597608/, /[~/'"`]\.mimi-yugioh\b/];
// 不查 test-isolation 的测试文件：它给这条检查造的坏仓里本来就要写这些
const ISOLATION_EXEMPT = new Set(['test/check.test.js']);

const RULES = {
  // 依赖只许白名单里的，没有 devDependencies，没有旧应用的包和文件
  'deps-whitelist': (root) => {
    const pkg = JSON.parse(read(root, 'package.json'));
    const out = [];
    for (const key of ['devDependencies', 'optionalDependencies', 'peerDependencies']) {
      if (pkg[key] && Object.keys(pkg[key]).length) out.push(`package.json 有 ${key}：${Object.keys(pkg[key]).join(', ')}。依赖只许 ${[...ALLOWED_DEPS].join('、')}，不加构建`);
    }
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (!ALLOWED_DEPS.has(name)) out.push(`package.json 的 dependencies 里有 ${name}：只许 ${[...ALLOWED_DEPS].join('、')}（要加先开票说明）${LEGACY_DEPS.test(name) ? '。这是旧应用的包' : ''}`);
    }
    for (const f of LEGACY_FILES) if (existsSync(join(root, f))) out.push(`${f} 是旧应用（Next.js / Supabase / Cloudflare）的文件，不许回来`);
    return out;
  },
  // 插件只做外壳：页面只 import 工作区给的模块、不自己发请求；后端只用 urllib 转给 YUGIOH_URL（只许本机）
  plugin(root) {
    const out = [];
    if (!existsSync(join(root, PLUGIN_JS))) return [`没有 ${PLUGIN_JS}`];
    if (!existsSync(join(root, PLUGIN_API))) return [`没有 ${PLUGIN_API}`];
    const js = withoutComments(read(root, PLUGIN_JS));
    for (const m of importsOf(js)) if (!PLUGIN_MODULES.has(m)) out.push(`${PLUGIN_JS} import 了 ${m}：页面只许 import 网页工作区给的 ${[...PLUGIN_MODULES].join('、')}`);
    for (const [re, why] of PAGE_BAD) if (re.test(js)) out.push(`${PLUGIN_JS}：${why}`);
    if (PAGE_TEXT_BAD.test(js.replace(/const CSS = `[\s\S]*?`;/, ''))) out.push(`${PLUGIN_JS}：页面文字里有百分比、场面估值或「还差」：展开中屏不显示这些（结算在结束回合以后）`);
    const py = stripPy(read(root, PLUGIN_API));
    for (const [re, why] of API_BAD) if (re.test(py)) out.push(`${PLUGIN_API}：${why}`);
    if (!/YUGIOH_URL/.test(py) || !/LOCAL_HOSTS/.test(py)) out.push(`${PLUGIN_API}：转发的地址要由 YUGIOH_URL 定，并且只许本机（LOCAL_HOSTS）`);
    return out;
  },
  // 插件在 Hermes 里能装上：后端文件能编译；页面用 mac-mini 的 plugin-load.mjs 加载，登记的恰好是 /yugioh 和侧栏「游戏王」
  'plugin-loads'(root) {
    const mini = process.env.MAC_MINI_REPO ?? join(homedir(), 'work/personal/repos/mac-mini');
    const loader = join(mini, '.claude/skills/verify-panel/bin/plugin-load.mjs');
    if (!existsSync(loader)) return [`没有 ${loader}：要 mac-mini 的检出（MAC_MINI_REPO）才能查页面能不能加载`];
    const out = [];
    const py = spawnSync('python3', ['-c', 'import sys; compile(open(sys.argv[1]).read(), sys.argv[1], "exec")', join(root, PLUGIN_API)], { encoding: 'utf8' });
    if (py.status !== 0) out.push(`${PLUGIN_API} 编译不过：${py.stderr.trim().split('\n').pop()}`);
    const r = spawnSync(process.execPath, [loader, join(root, PLUGIN_JS)], { encoding: 'utf8' });
    if (r.status !== 0) return [...out, `${PLUGIN_JS} 加载不了：${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ')}`];
    const got = JSON.parse(r.stdout);
    const routes = got.contributions.filter((c) => c.area === 'ROUTES_AREA' && c.render === 'function').map((c) => c.data.path);
    const nav = got.contributions.filter((c) => c.area === 'SIDEBAR_NAV_AREA').map((c) => `${c.data.path} ${c.data.label}`);
    if (got.id !== 'yugioh' || routes.join() !== '/yugioh' || nav.join() !== '/yugioh 游戏王') out.push(`${PLUGIN_JS} 登记了 id ${got.id}、页面 ${routes}、侧栏 ${nav}；要的是 yugioh、/yugioh、/yugioh 游戏王`);
    const yaml = read(root, 'plugin/plugin.yaml');
    const manifest = JSON.parse(read(root, 'plugin/dashboard/manifest.json'));
    if (!/^name:\s*yugioh\s*$/m.test(yaml) || manifest.name !== 'yugioh') out.push('plugin.yaml 和 dashboard/manifest.json 的 name 都要是 yugioh');
    if (!existsSync(join(root, 'plugin/dashboard', manifest.api ?? ''))) out.push(`manifest.json 的 api ${manifest.api} 不是 plugin/dashboard/ 里的文件`);
    return out;
  },
  // src/ 里写的地址只许本机（src/decks/ 里的出处链接除外）；scripts/prepare-engine.js 是唯一下载公开引擎数据的地方，不在此列
  outbound: (root) => [...jsFiles(root, 'src').filter((f) => !OUTBOUND_EXEMPT.test(f.replaceAll('\\', '/'))), ...filesIn(root, 'plugin', /\.(js|py)$/)].flatMap((f) => [...new Set([...(f.endsWith('.py') ? stripPy(read(root, f)) : withoutComments(read(root, f))).matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))]
    .filter((host) => !LOCAL_HOSTS.has(host)).map((host) => `${f} 里有外部地址 ${host}：服务只连本机`)),
  'test-isolation': (root) => jsFiles(root, 'test').filter((f) => !ISOLATION_EXEMPT.has(f)).flatMap((f) => {
    const text = withoutComments(read(root, f));
    return LIVE.filter((re) => re.test(text)).map((re) => `${f} 写了 ${re.source.replace(/\\b|\\|\[[^\]]*\]/g, '')}：测试只用临时目录和 PORT=0 起的服务（test/helpers.js），不碰线上`);
  }),
  boundary: (root) => jsFiles(root, 'src').flatMap((f) => {
    const text = withoutComments(read(root, f));
    return BOUNDARY.filter((b) => !b.only.includes(f) && b.re.test(text)).map((b) => `${f} 用了 ${b.what}：${b.why}`);
  }),
};

export function run(rule, root) {
  if (!RULES[rule]) return [`没有这条检查：${rule}（有：${Object.keys(RULES).join(' ')}）`];
  return RULES[rule](root);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const [rule, root = fileURLToPath(new URL('..', import.meta.url))] = process.argv.slice(2);
  const problems = run(rule, root);
  for (const p of problems) console.error(`${rule}: ${p}`);
  process.exitCode = problems.length ? 1 : 0;
}
