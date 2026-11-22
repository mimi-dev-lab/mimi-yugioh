// 准备引擎数据：把固定版本的 Project Ignis CardScripts（卡牌脚本）和 BabelCDB 的 cards.cdb（卡库）下载到目录里。
// 用法：node scripts/prepare-engine.js [目录]（默认 $YUGIOH_ENGINE，再默认 $YUGIOH_DATA/engine，再默认 ~/.mimi-yugioh/engine）。
// 目录里已经是这个版本就什么都不做；./ci 和测试用 ~/.cache/mimi-yugioh/engine 这个复用的缓存目录（见 src/engine-dir.js）。
// 整个仓里只有这个脚本联网（下载公开的引擎数据，不带任何用户数据）。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 固定版本：改这两个 sha 就是升级引擎数据，要重跑测试
export const SCRIPTS_SHA = 'c569c5383b77dc1c5493c8434978ab316987beaf';
export const CDB_SHA = '7d2ad0a13e5faf70b11777719beec9ead96c2c31';
export const VERSION = `CardScripts ${SCRIPTS_SHA}\nBabelCDB ${CDB_SHA}\n`;

const SCRIPTS_URL = `https://codeload.github.com/ProjectIgnis/CardScripts/tar.gz/${SCRIPTS_SHA}`;
const CDB_URL = `https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/${CDB_SHA}/cards.cdb`;

const download = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载 ${url} 失败：HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

export async function prepare(dir) {
  const stamp = join(dir, 'VERSION');
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === VERSION && existsSync(join(dir, 'cards.cdb')) && existsSync(join(dir, 'scripts/constant.lua'))) return false;
  mkdirSync(dirname(dir), { recursive: true });
  const tmp = mkdtempSync(join(dirname(dir), '.engine-'));
  try {
    mkdirSync(join(tmp, 'scripts'));
    writeFileSync(join(tmp, 'cards.cdb'), await download(CDB_URL));
    const tgz = join(tmp, 'scripts.tgz');
    writeFileSync(tgz, await download(SCRIPTS_URL));
    const tar = spawnSync('tar', ['-xzf', tgz, '--strip-components=1', '-C', join(tmp, 'scripts')], { encoding: 'utf8' });
    if (tar.status !== 0) throw new Error(`解压脚本失败：${tar.stderr}`);
    rmSync(tgz);
    if (!existsSync(join(tmp, 'scripts/constant.lua'))) throw new Error('脚本包里没有 constant.lua');
    writeFileSync(join(tmp, 'VERSION'), VERSION);
    rmSync(dir, { recursive: true, force: true });
    renameSync(tmp, dir);
    return true;
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? process.env.YUGIOH_ENGINE ?? join(process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh'), 'engine');
  prepare(dir).then((did) => console.log(did ? `引擎数据已下载到 ${dir}` : `引擎数据已是固定版本：${dir}`), (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
