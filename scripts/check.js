// ./ci 里的机械检查：架构约定（AGENTS.md「架构约定」）里能机械查的那几条。
// 用法：node scripts/check.js <规则> [仓根]（仓根默认是本仓）。过了不出声、退出码 0；没过一行一处，退出码 1。
// 规则在下面的 RULES 里；./ci 跑哪几条看 checks/list。照 lifaninjp/finance 的 scripts/check.js。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
  // src/ 里写的地址只许本机（src/decks/ 里的出处链接除外）；scripts/prepare-engine.js 是唯一下载公开引擎数据的地方，不在此列
  outbound: (root) => jsFiles(root, 'src').filter((f) => !OUTBOUND_EXEMPT.test(f.replaceAll('\\', '/'))).flatMap((f) => [...new Set([...withoutComments(read(root, f)).matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))]
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
