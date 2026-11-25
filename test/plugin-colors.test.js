import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COLOR, SUMMON_TAG, ZONE_COLOR } from '../src/anim-stage.js';

// 插件页只 import SDK 和 React（AGENTS.md「架构约定」），拿不到 src/anim-stage.js，步骤面板的颜色是抄过去的一份。
// 这里读 plugin.js 的源码，把那三个常量取出来，和动画的对照：面板的标签、左边条和场面上的横幅、高亮、连线是同一套颜色。
const source = readFileSync(new URL('../plugin/webapp/plugin.js', import.meta.url), 'utf8');

function pluginConst(name) {
  const line = source.split('\n').find((l) => l.startsWith(`const ${name} = `));
  assert.ok(line, `plugin.js 里没有 const ${name}`);
  const body = line.slice(`const ${name} = `.length).replace(/;\s*$/, '');
  return new Function('COLOR', `return (${body});`)(COLOR);
}

test('步骤面板的颜色和路线动画的一致（COLOR、ZONE_COLOR、SUMMON_TAG）', () => {
  assert.deepEqual(pluginConst('COLOR'), COLOR);
  assert.deepEqual(pluginConst('ZONE_COLOR'), ZONE_COLOR);
  assert.deepEqual(pluginConst('SUMMON_TAG'), SUMMON_TAG);
});
