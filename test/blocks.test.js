import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkDeck } from '../src/deck.js';
import { BRANDED } from '../src/decks/branded.js';
import { blockVariants, checkBlocks, coverHand, LOOSE, opInBlocks, opsOf, routeBlocks, routesUsing } from '../src/blocks.js';

const clone = () => structuredClone(BRANDED);

describe('积木数据的检查（纯函数，不起服务）', () => {
  test('烙印的积木数据没有问题，卡组检查也带上它', () => {
    assert.deepEqual(checkBlocks(BRANDED), []);
    const bad = clone();
    bad.blocks.list[0].name = '';
    assert.match(checkDeck(bad).join('\n'), /缺名字/);
  });

  test('6 到 10 块，名字不重复，每块都写了要什么和给什么', () => {
    const { list: blocks } = BRANDED.blocks;
    assert.ok(blocks.length >= 6 && blocks.length <= 10, `${blocks.length} 块`);
    assert.equal(new Set(blocks.map((b) => b.name)).size, blocks.length);
    for (const b of blocks) assert.ok(b.needs.trim() && b.gives.trim(), b.name);
  });

  test('查得出：名字重复、缺要什么 / 给什么、路线没标积木、漏步、重叠、越界、积木不存在、同一块在一条路线里用两段、没人用的积木', () => {
    const dupName = clone(); dupName.blocks.list[1].name = dupName.blocks.list[0].name;
    assert.match(checkBlocks(dupName).join('\n'), /名字 .* 重复/);
    const noNeeds = clone(); noNeeds.blocks.list[0].needs = ' ';
    assert.match(checkBlocks(noNeeds).join('\n'), /缺「要什么」/);
    const noGives = clone(); noGives.blocks.list[0].gives = '';
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
    const twice = clone(); twice.blocks.segments['white-albaz'][2].block = twice.blocks.segments['white-albaz'][0].block;
    assert.match(checkBlocks(twice).join('\n'), /white-albaz 里积木 albaz-jump 用了不止一段/);
    const unused = clone(); unused.blocks.list.push({ id: 'spare', name: '闲置', color: '#010203', needs: '随便', gives: '随便' });
    assert.match(checkBlocks(unused).join('\n'), /积木 闲置 没有路线用/);
    const extraRoute = clone(); extraRoute.blocks.segments.ghost = [{ block: 'albaz-jump', from: 1, to: 1 }];
    assert.match(checkBlocks(extraRoute).join('\n'), /积木数据里的路线 ghost 不存在/);
  });

  test('每块积木有自己的颜色（#rrggbb），步号条按它分段着色；颜色不许重复', () => {
    const { list: blocks } = BRANDED.blocks;
    for (const b of blocks) assert.match(b.color, /^#[0-9a-f]{6}$/i, b.name);
    assert.equal(new Set(blocks.map((b) => b.color.toLowerCase())).size, blocks.length);
    const bad = clone(); bad.blocks.list[0].color = 'red';
    assert.match(checkBlocks(bad).join('\n'), /颜色 red 不是 #rrggbb/);
    const dup = clone(); dup.blocks.list[1].color = dup.blocks.list[0].color;
    assert.match(checkBlocks(dup).join('\n'), /颜色 .* 重复/);
  });

  test('routesUsing：哪些路线用到这块积木，按卡组里路线的先后', () => {
    assert.deepEqual(routesUsing(BRANDED, 'saint-relay'), ['white-albaz', 'high-spirits-fuwalos', 'high-spirits-shrouded']);
    assert.deepEqual(routesUsing(BRANDED, 'sword-lock'), ['white-saint', 'high-spirits-albaz']);
    assert.deepEqual(routesUsing(BRANDED, 'nope'), []);
  });

  test('积木要被复用：每块出现在 2 条以上的路线里', () => {
    for (const b of BRANDED.blocks.list) {
      const routes = routesUsing(BRANDED, b.id);
      assert.ok(routes.length >= 2, `${b.name} 只在 ${routes.length} 条路线里`);
    }
  });
});

const route = (id) => BRANDED.routes.find((r) => r.id === id);
const steps = (id, from, to) => route(id).steps.slice(from - 1, to);
const nameOf = Object.fromEntries(BRANDED.blocks.list.map((b) => [b.id, b.name]));
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
    assert.deepEqual(result.stuck, { step: 2, op: { idle: 'special-summon', code: 78397661 } }); // 第 3 个步骤的第一个操作：停在圣女接力开头，没停在被改的那一步
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

describe('coverHand 的边角：没有可比的操作、所有操作都被口径略过', () => {
  test('空的展开、只有 pass 和 finish 的展开：拼得满（什么都不用拼），没有 stuck，不抛错', () => {
    const cases = [[[], 0], [[{ text: '放行', do: ['pass', 'pass'] }], 2], [[{ text: '回合结束', do: ['finish'] }], 0], [[{ text: '放行', do: ['pass', 'finish'] }], 1]]; // [手, 不含 finish 的操作个数 = depth]
    for (const [hand, depth] of cases) assert.deepEqual(cover(hand), { covered: true, depth, blocks: [], stuck: null }, JSON.stringify(hand));
  });

  test('放宽口径下全被略过的展开（只有放哪一格）同样拼得满', () => {
    assert.deepEqual(cover([{ text: '放置', do: [{ place: 1 }, { position: 1 }] }], LOOSE), { covered: true, depth: 0, blocks: [], stuck: null });
  });

  test('任何一手的任何前缀都不抛错；拼不满时 stuck 一定有，拼满时一定没有（两个口径）', () => {
    for (const r of BRANDED.routes) {
      const ops = r.steps.flatMap((s, i) => s.do.map((op) => ({ text: `${r.id}#${i}`, do: [op] })));
      for (let k = 0; k <= ops.length; k++) {
        for (const options of [undefined, LOOSE]) {
          const result = cover(ops.slice(0, k), options);
          assert.equal(result.stuck === null, result.covered, `${r.id} 前 ${k} 个操作`);
          if (!result.covered) assert.ok(Number.isInteger(result.stuck.step) && result.stuck.step < k && result.stuck.op !== undefined, `${r.id} 前 ${k} 个操作`);
        }
      }
    }
  });
});

describe('opInBlocks：某个操作有没有出现在某块积木的某个写法里', () => {
  const has = opInBlocks(variants);

  test('积木写法里有的操作是 true，哪怕是另建的、内容相同的对象；没有的是 false', () => {
    assert.equal(has(structuredClone(route('white-albaz').steps[0].do[0])), true);
    assert.equal(has('pass'), true);
    assert.equal(has({ idle: 'activate', code: 1 }), false);
    assert.equal(has({ pick: [1, 2, 3] }), false);
  });

  test('和 coverHand 匹配用的是同一个口径：每个写法里的每个操作都认得', () => {
    for (const v of variants) for (const op of v.ops) assert.equal(has(op), true, JSON.stringify(op));
  });
});
