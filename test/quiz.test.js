import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Rating } from 'ts-fsrs';
import { BRANDED } from '../src/decks/branded.js';
import { rngFrom } from '../src/hand.js';
import { EASY_MS, FACTS, HARD_MS, KINDS, OPTION_COUNT, ROLES, cardStates, dueCodes, grade, historyOf, makeQuestion, nextQuestion, rate, review } from '../src/quiz.js';

const NOW = new Date('2026-11-23T00:00:00Z');
const MIN = 60_000; const DAY = 86_400_000;
const WHITE = 73819701; // 白之落胤，起手
const allCodes = Object.keys(BRANDED.cards).map(Number);

describe('记卡：评分换算和下一次到期', () => {
  test('对且快 = Easy、对 = Good、对但慢 = Hard、错 = Again，5 秒和 10 秒各算在快的那一边', () => {
    assert.equal(rate(true, 3000), Rating.Easy);
    assert.equal(rate(true, EASY_MS), Rating.Easy);
    assert.equal(rate(true, EASY_MS + 1), Rating.Good);
    assert.equal(rate(true, HARD_MS), Rating.Good);
    assert.equal(rate(true, HARD_MS + 1), Rating.Hard);
    assert.equal(rate(false, 1000), Rating.Again);
    assert.equal(rate(false, 30000), Rating.Again);
  });

  test('第一次答：快且对 8 天后、对 10 分钟后、慢 5.5 分钟后、错 1 分钟后（FSRS 默认参数）', () => {
    const due = (correct, ms) => new Date(review(null, rate(correct, ms), NOW).due) - NOW;
    assert.equal(due(true, 3000), 8 * DAY);
    assert.equal(due(true, 8000), 10 * MIN);
    assert.equal(due(true, 20000), 5.5 * MIN);
    assert.equal(due(false, 3000), MIN);
  });

  test('状态能存成 JSON 再读回来接着算；到期那天再答快且对，间隔比第一次的 8 天长', () => {
    const first = JSON.parse(JSON.stringify(review(null, Rating.Easy, NOW)));
    const at = new Date(first.due);
    const second = review(first, Rating.Easy, at);
    assert.ok(new Date(second.due) - at > 8 * DAY);
    assert.equal(second.reps, 2);
    const lapsed = review(first, Rating.Again, at);
    assert.ok(new Date(lapsed.due) - at < DAY, '答错很快再考');
  });

  test('到期的卡：没答过的都算，答过的到期了才算；每张卡答完之后不再到期，到点又出现；没有每日题量', () => {
    const states = new Map();
    assert.equal(dueCodes(BRANDED, states, NOW, rngFrom(1)).due.length, allCodes.length);
    states.set(WHITE, review(null, Rating.Easy, NOW));
    const day1 = dueCodes(BRANDED, states, new Date(NOW.getTime() + DAY), rngFrom(1));
    assert.equal(day1.due.length, allCodes.length - 1);
    assert.ok(!day1.due.includes(WHITE));
    const day9 = dueCodes(BRANDED, states, new Date(NOW.getTime() + 9 * DAY), rngFrom(1));
    assert.equal(day9.due[0], WHITE, '答过的到期卡排在没答过的前面');
    assert.equal(day9.reviewing.length, 1);
  });

  test('日志行还原成每张卡最后的状态，和这张卡以往的用时（旧的在前）', () => {
    const rows = [
      { type: 'hand', id: 'x' },
      { type: 'answer', code: WHITE, ms: 9100, card: { n: 1 } },
      { type: 'answer', code: 1, ms: 4000, card: { n: 1 } },
      { type: 'answer', code: WHITE, ms: 3000, card: { n: 2 } },
    ];
    assert.deepEqual(cardStates(rows).get(WHITE), { n: 2 });
    assert.deepEqual(historyOf(rows, WHITE), [9100, 3000]);
  });
});

describe('记卡：出题', () => {
  const made = (code, kind, seed = 1) => makeQuestion(BRANDED, code, kind, rngFrom(seed));

  test('每张卡、三种题都出得了：4 个选项，只有一个对，文字互不相同，干扰项来自同一卡组', () => {
    const everyText = new Set(allCodes.flatMap((c) => [BRANDED.cards[c].md, ...FACTS.map(([k]) => BRANDED.cards[c][k])]));
    for (const code of allCodes) {
      for (const kind of KINDS) {
        for (const seed of [1, 2, 3]) {
          const { question, answer } = made(code, kind, seed);
          const texts = question.options.map((o) => o.text);
          assert.equal(texts.length, OPTION_COUNT, `${code} ${kind}`);
          assert.equal(new Set(texts).size, OPTION_COUNT, `${code} ${kind} 选项有重复：${texts}`);
          assert.ok(texts.every((t) => everyText.has(t)), `${code} ${kind} 有卡组外的选项`);
          assert.ok(answer.index >= 0 && answer.index < OPTION_COUNT);
          assert.equal(answer.code, code);
        }
      }
    }
  });

  test('identify：看卡图、正确项是 Master Duel 卡名、要选角色；题面不带对错', () => {
    const { question, answer } = made(WHITE, 'identify');
    assert.equal(question.image, WHITE);
    assert.equal(question.options[answer.index].text, '白之落胤');
    assert.deepEqual(question.roles, ROLES);
    assert.deepEqual(answer.roles, ['起手']);
    assert.ok(!JSON.stringify(question).includes('correct'));
  });

  test('fill：给卡名和三件事里的两件，缺的那件的正确项是这张卡自己的', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { question, answer } = made(WHITE, 'fill', seed);
      const card = BRANDED.cards[WHITE];
      assert.equal(question.name, '白之落胤');
      assert.equal(question.given.length, 2);
      const [key] = FACTS.find(([, label]) => label === question.missing);
      assert.equal(question.options[answer.index].text, card[key]);
      assert.ok(question.given.every((g) => g.label !== question.missing));
    }
  });

  test('find：给「干什么」找卡；正确项是这张卡的名字，题里没有卡图', () => {
    const { question, answer } = made(WHITE, 'find');
    assert.equal(question.image, null);
    assert.ok(question.prompt.includes(BRANDED.cards[WHITE].does));
    assert.equal(question.options[answer.index].text, '白之落胤');
  });

  test('同一个种子出同一题；换种子选项的顺序会变', () => {
    assert.deepEqual(made(WHITE, 'identify', 5), made(WHITE, 'identify', 5));
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => made(WHITE, 'identify', s).question.options.map((o) => o.text).join('|')));
    assert.ok(orders.size > 1);
  });

  test('卡组里互不相同的干扰项不够时出不了题（返回 null）', () => {
    const tiny = { cards: { 1: { md: 'A', role: '起手', does: 'x', cost: 'y', limit: 'z' }, 2: { md: 'B', role: '延伸', does: 'x', cost: 'y', limit: 'z' } } };
    assert.equal(makeQuestion(tiny, 1, 'identify', rngFrom(1)), null);
  });
});

describe('记卡：批改和出下一题', () => {
  const answer = { index: 2, roles: ['起手'], code: WHITE };
  test('identify 名字和角色都对才算对；fill / find 只看选项', () => {
    assert.equal(grade(answer, { option: 2, roles: ['起手'] }).correct, true);
    assert.equal(grade(answer, { option: 2, roles: ['延伸'] }).correct, false);
    assert.equal(grade(answer, { option: 2, roles: [] }).correct, false);
    assert.equal(grade(answer, { option: 2, roles: ['起手', '延伸'] }).correct, false);
    assert.equal(grade(answer, { option: 1, roles: ['起手'] }).correct, false);
    assert.equal(grade({ index: 0, roles: [], code: 1 }, { option: 0, roles: [] }).correct, true);
    assert.equal(grade({ index: 0, roles: [], code: 1 }, { option: 0, roles: ['起手'] }).correct, false);
  });

  test('出下一题：先出到期的老卡再出新卡；全部不到期返回 null；同种子同题', () => {
    const fresh = nextQuestion(BRANDED, [], NOW, 7);
    assert.equal(fresh.due, allCodes.length);
    assert.deepEqual(fresh, nextQuestion(BRANDED, [], NOW, 7));
    const rows = allCodes.map((code) => ({ type: 'answer', code, ms: 3000, card: review(null, Rating.Easy, NOW) }));
    assert.equal(nextQuestion(BRANDED, rows, new Date(NOW.getTime() + DAY), 7), null);
    const later = nextQuestion(BRANDED, rows.slice(0, 1), new Date(NOW.getTime() + 9 * DAY), 7);
    assert.equal(later.code, allCodes[0]);
    assert.deepEqual(later.history, [3000]);
    assert.equal(later.lastMs, 3000);
  });
});
