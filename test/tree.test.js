import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { TREE } from '../src/decks/branded-tree.js';
import { checkDeck } from '../src/deck.js';
import { parseJsonl } from '../src/opening-report.js';
import { bestRoutes, buildTree, checkTree, leavesOf, scoreTree, treeFileText, treeView, walkTree } from '../src/tree.js';

const rows = parseJsonl(readFileSync(new URL('../docs/opening-analysis.jsonl', import.meta.url), 'utf8'));
const clone = () => structuredClone(BRANDED);

describe('决策树数据（#52）', () => {
  test('叶子都指向存在的路线；每条路线至少有一个叶子', () => {
    const ids = new Set(BRANDED.routes.map((r) => r.id));
    const leaves = leavesOf(BRANDED.tree);
    for (const l of leaves) assert.ok(ids.has(l.route), `叶子指向 ${l.route}`);
    for (const id of ids) assert.ok(leaves.some((l) => l.route === id), `路线 ${id} 没有叶子`);
    assert.deepEqual(checkTree(BRANDED), []);
    assert.deepEqual(checkDeck(BRANDED), []);
  });

  test('提交的树等于脚本用路线数据和 500 手重算的（文件全文也一样）', () => {
    assert.equal(rows.length, 500);
    assert.deepEqual(buildTree(BRANDED, rows), TREE);
    assert.equal(readFileSync(new URL('../src/decks/branded-tree.js', import.meta.url), 'utf8'), treeFileText(buildTree(BRANDED, rows)));
  });

  test('每个问题都真是分岔：一条路上不重复问同一张卡', () => {
    for (const l of leavesOf(TREE)) assert.equal(new Set(l.path.map((p) => p.card)).size, l.path.length);
    assert.ok(leavesOf(TREE).length >= 2);
  });

  test('查得出：叶子指向不存在的路线、没有叶子的路线、重复问同一张卡、缺一边、问了速查之外的卡、覆盖措辞指向树里没有的卡或是空的', () => {
    const t = (edit) => { const d = clone(); edit(d); return checkTree(d).join('\n'); };
    assert.match(t((d) => { d.tree.yes.yes.route = 'nope'; }), /不存在的路线 nope/);
    assert.match(t((d) => { d.tree = { route: 'white-albaz' }; }), /没有叶子指向它/);
    assert.match(t((d) => { d.tree.yes.card = d.tree.card; }), /重复问了/);
    assert.match(t((d) => { delete d.tree.no; }), /缺「是」或「否」/);
    assert.match(t((d) => { d.tree.card = 14558127; }), /不在起手速查里/);
    assert.match(t((d) => { d.treeText.questions[14558127] = '？'; }), /不在树里/);
    assert.match(t((d) => { d.treeText.questions[d.tree.card] = ' '; }), /措辞是空的/);
  });
});

describe('最好路线和导向正确率的口径', () => {
  test('bestRoutes：只看能走通的路线，并列都算，都走不通是空', () => {
    assert.deepEqual(bestRoutes({ routeValues: { a: 30, b: 30, c: 20, d: null } }), ['a', 'b']);
    assert.deepEqual(bestRoutes({ routeValues: { a: null, b: null } }), []);
    assert.deepEqual(bestRoutes({}), []);
  });

  test('scoreTree：命中并列的任一条算对；没有路线能走的手不算对但留在分母；严格口径要路线值等于最好场面值', () => {
    const tree = { card: 1, yes: { route: 'a' }, no: { route: 'b' } };
    const rs = [
      { hand: [1], value: 30, routeValues: { a: 30, b: 30 } }, // 并列，走 a：对、严格对
      { hand: [2], value: 30, routeValues: { a: 30, b: 30 } }, // 并列，走 b：对、严格对
      { hand: [1], value: 40, routeValues: { a: 30, b: 20 } }, // 走 a 是最好路线，但没到最好场面值：对、严格不对
      { hand: [2], value: 30, routeValues: { a: 30, b: 20 } }, // 走 b，最好是 a：错
      { hand: [2], value: 10, routeValues: { a: null, b: null } }, // 没有路线能走：不算
    ];
    const s = scoreTree(tree, rs);
    assert.deepEqual([s.total, s.withRoute, s.noRoute, s.correct, s.strict], [5, 4, 1, 3, 2]);
    assert.deepEqual(s.perRoute, { a: { reached: 2, correct: 2 }, b: { reached: 3, correct: 1 } });
    assert.deepEqual(s.single, { route: 'a', correct: 4 });
  });

  test('walkTree：手里有就走是', () => {
    const tree = { card: 1, yes: { card: 2, yes: { route: 'x' }, no: { route: 'y' } }, no: { route: 'z' } };
    assert.equal(walkTree(tree, [1, 2]), 'x');
    assert.equal(walkTree(tree, [1, 3]), 'y');
    assert.equal(walkTree(tree, [3]), 'z');
  });

  test('buildTree：一手都没赢过的路线，靠自己的起手也有叶子；只有一条路线就不问', () => {
    const t = buildTree(BRANDED, []);
    assert.deepEqual(new Set(leavesOf(t).map((l) => l.route)), new Set(BRANDED.routes.map((r) => r.id)));
    assert.deepEqual(buildTree({ ...BRANDED, routes: [BRANDED.routes[0]] }, []), { route: BRANDED.routes[0].id });
  });

  test('提交的树的导向正确率和报告里写的一样，比永远指同一条路线强', () => {
    const s = scoreTree(TREE, rows);
    assert.equal(s.total, 500);
    const text = readFileSync(new URL('../docs/opening-analysis.md', import.meta.url), 'utf8');
    assert.ok(text.includes(`**正确导向 ${s.correct} / 500 手**`));
    assert.ok(s.correct > s.single.correct);
  });
});

describe('treeView', () => {
  test('问题措辞：有覆盖用覆盖，没有用默认；平铺的叶子和嵌套的一致；指向的路线不存在就抛错', () => {
    const routes = BRANDED.routes.map((r) => ({ id: r.id, name: r.name, needs: { code: r.needs }, end: { interrupts: 1 }, steps: r.steps }));
    const v = treeView(BRANDED, routes);
    let asked = 0;
    const walk = (n) => { if (n.card) { asked++; assert.equal(n.question, BRANDED.treeText.questions[n.card.code] ?? `手里有「${n.card.md}」吗？`); walk(n.yes); walk(n.no); } };
    walk(v.root);
    assert.ok(asked > 0);
    assert.deepEqual(v.leaves.map((l) => l.route.id), leavesOf(TREE).map((l) => l.route));
    assert.throws(() => treeView(BRANDED, routes.slice(1)), /不存在/);
  });
});
