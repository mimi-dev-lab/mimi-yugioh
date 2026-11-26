import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkDeck } from '../src/deck.js';
import { BRANDED } from '../src/decks/branded.js';
import { blockVariants, checkBlocks, coverHand, LOOSE, opsOf, routeBlocks } from '../src/blocks.js';

const clone = () => structuredClone(BRANDED);

describe('积木数据的检查（纯函数，不起服务）', () => {
  test('烙印的积木数据没有问题，卡组检查也带上它', () => {
    assert.deepEqual(checkBlocks(BRANDED), []);
    const bad = clone();
    bad.blocks.blocks[0].name = '';
    assert.match(checkDeck(bad).join('\n'), /缺名字/);
  });

  test('6 到 10 块，名字不重复，每块都写了要什么和给什么', () => {
    const { blocks } = BRANDED.blocks;
    assert.ok(blocks.length >= 6 && blocks.length <= 10, `${blocks.length} 块`);
    assert.equal(new Set(blocks.map((b) => b.name)).size, blocks.length);
    for (const b of blocks) assert.ok(b.needs.trim() && b.gives.trim(), b.name);
  });

  test('查得出：名字重复、缺要什么 / 给什么、路线没标积木、漏步、重叠、越界、积木不存在、没人用的积木', () => {
    const dupName = clone(); dupName.blocks.blocks[1].name = dupName.blocks.blocks[0].name;
    assert.match(checkBlocks(dupName).join('\n'), /名字 .* 重复/);
    const noNeeds = clone(); noNeeds.blocks.blocks[0].needs = ' ';
    assert.match(checkBlocks(noNeeds).join('\n'), /缺「要什么」/);
    const noGives = clone(); noGives.blocks.blocks[0].gives = '';
    assert.match(checkBlocks(noGives).join('\n'), /缺「给什么」/);
    const noRoute = clone(); delete noRoute.blocks.segments['white-albaz'];
    assert.match(checkBlocks(noRoute).join('\n'), /white-albaz 没有标积木/);
    const gap = clone(); gap.blocks.segments['white-albaz'][1].from = 4;
    assert.match(checkBlocks(gap).join('\n'), /white-albaz 第 3 步没有归到任何积木/);
    const overlap = clone(); overlap.blocks.segments['white-albaz'][1].from = 2;
    assert.match(checkBlocks(overlap).join('\n'), /white-albaz 第 2 步归了不止一块积木/);
    const tooFar = clone(); tooFar.blocks.segments['white-albaz'].at(-1).to = 18;
    assert.match(checkBlocks(tooFar).join('\n'), /white-albaz 没有第 18 步/);
    const unknown = clone(); unknown.blocks.segments['white-albaz'][0].block = 'nope';
    assert.match(checkBlocks(unknown).join('\n'), /white-albaz 用了不存在的积木 nope/);
    const unused = clone(); unused.blocks.blocks.push({ id: 'spare', name: '闲置', needs: '随便', gives: '随便' });
    assert.match(checkBlocks(unused).join('\n'), /积木 闲置 没有路线用/);
    const extraRoute = clone(); extraRoute.blocks.segments.ghost = [{ block: 'albaz-jump', from: 1, to: 1 }];
    assert.match(checkBlocks(extraRoute).join('\n'), /积木数据里的路线 ghost 不存在/);
  });

  test('积木要被复用：每块出现在 2 条以上的路线里', () => {
    for (const b of BRANDED.blocks.blocks) {
      const routes = Object.entries(BRANDED.blocks.segments).filter(([, segs]) => segs.some((s) => s.block === b.id));
      assert.ok(routes.length >= 2, `${b.name} 只在 ${routes.length} 条路线里`);
    }
  });
});

const route = (id) => BRANDED.routes.find((r) => r.id === id);
const steps = (id, from, to) => route(id).steps.slice(from - 1, to);
const nameOf = Object.fromEntries(BRANDED.blocks.blocks.map((b) => [b.id, b.name]));
const variants = blockVariants(BRANDED);
const cover = (hand, options) => coverHand(hand, variants, options);
const names = (result) => result.blocks.map((b) => nameOf[b.block]);

describe('积木的操作序列：取自路线数据里它对应的那几步', () => {
  test('每条路线自己的步骤，能被它自己标的那几块积木拼满，用到的积木和标的一致', () => {
    for (const r of BRANDED.routes) {
      const result = cover(r.steps);
      assert.equal(result.covered, true, `${r.id} 拼不满`);
      assert.deepEqual(names(result), routeBlocks(BRANDED, r.id).map((b) => b.name), r.id);
    }
  });

  test('routeBlocks：每条路线的分段按步号排好，带名字和要什么 / 给什么', () => {
    const [first, ...rest] = routeBlocks(BRANDED, 'white-albaz');
    assert.deepEqual([first.name, first.from, first.to], ['落胤起跳', 1, 2]);
    assert.ok(first.needs && first.gives);
    assert.deepEqual(rest.map((b) => b.name), ['圣女接力', '结束阶段大回收', '开幕搭桥', '冰剑龙封场']);
    assert.deepEqual(rest.map((b) => [b.from, b.to]), [[3, 5], [6, 7], [8, 13], [14, 17]]);
  });

  test('同一块积木在几条路线里写得一样的合并成一个写法，写法记着出现在哪些路线的哪几步', () => {
    const jump = variants.filter((v) => nameOf[v.block] === '落胤起跳');
    assert.ok(jump.length >= 2); // 手牌落胤、白之圣女起手、天底起手，写法不同
    const fromHand = jump.find((v) => v.routes.some((r) => r.id === 'white-albaz'));
    assert.deepEqual(fromHand.routes.map((r) => [r.id, r.from, r.to]), [['white-albaz', 1, 2], ['high-spirits-fuwalos', 2, 3], ['high-spirits-shrouded', 2, 3], ['high-spirits-albaz', 2, 3]]);
    assert.deepEqual(fromHand.ops, opsOf(steps('white-albaz', 1, 2)));
  });

  test('不同路线的积木能拼成没见过的展开：气炎线的落胤起跳接白之圣女线的三英压场', () => {
    const result = cover([...steps('high-spirits-albaz', 2, 3), ...steps('white-saint', 4, 6)]);
    assert.equal(result.covered, true);
    assert.deepEqual(names(result), ['落胤起跳', '三英压场']);
  });

  test('一个操作对不上就拼不满：depth 停在那块积木前面', () => {
    const hands = steps('white-albaz', 1, 2);
    const wrong = structuredClone(steps('white-albaz', 3, 5));
    wrong[2].do[2] = { pick: [14558127] }; // 库妸㽗送去墓地的不是卡尔塔西亚
    const result = cover([...hands, ...wrong]);
    assert.equal(result.covered, false);
    assert.deepEqual(result.blocks, []);
    assert.equal(result.depth, opsOf(hands).length);
  });

  test('开头的 pass（回合开始时手坑的连锁窗口选不发动）和结尾的 pass（放行连锁窗口）不算；中间多一个 pass 就对不上', () => {
    const base = steps('white-albaz', 1, 5);
    const lead = { text: '不发动', do: ['pass', 'pass'] };
    assert.equal(cover([lead, ...base, { text: '放行', do: ['pass', 'pass'] }]).covered, true);
    const middle = structuredClone(base);
    middle[2].do.splice(1, 0, 'pass');
    assert.equal(cover(middle).covered, false);
    assert.equal(cover([...base, { text: '多发动了一张', do: [{ idle: 'activate', code: 1 }] }]).covered, false);
  });

  test('finish 不参与匹配：搜索走到回合结束就停，不写 finish', () => {
    const withFinish = steps('branded-fusion', 9, 10);
    assert.deepEqual(withFinish.at(-1).do, ['finish']);
    assert.equal(cover(withFinish).covered, true);
    assert.equal(cover(withFinish.slice(0, 1)).covered, true);
  });

  test('放宽口径：不看放哪一格、表示形式和 pass，选了什么卡、选哪个选项也不看，只比发动、召唤这些动作；严格口径要一字不差', () => {
    const other = structuredClone(steps('high-spirits-fuwalos', 1, 1));
    other[0].do = other[0].do.map((op) => (op.pick?.[0] === 51409648 ? { pick: [25451383] } : op)); // 送去墓地的换了一只
    assert.equal(cover(other).covered, false);
    assert.equal(cover(other, LOOSE).covered, true);
    const wrongAction = structuredClone(other);
    wrongAction[0].do[0] = { chain: 1234 };
    assert.equal(cover(wrongAction, LOOSE).covered, false);
  });
});
