#!/usr/bin/env node
/**
 * 导入卡牌数据到 D1
 * 
 * Step 1: 生成 SQL 文件
 * Step 2: 用 shell 脚本执行
 */

const fs = require('fs');
const path = require('path');

const CARDS_FILE = path.join(__dirname, '../../yugioh_cards/yugioh_cards_data.json');
const OUTPUT_DIR = path.join(__dirname, '../.tmp/batches');
const BATCH_SIZE = 200;

function escapeSQL(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''").replace(/\r?\n/g, ' ')}'`;
}

function generateInsertSQL(cards) {
  const values = cards.map(card => {
    return `(${card.id}, ${escapeSQL(card.name)}, ${escapeSQL(card.name_cn)}, ${escapeSQL(card.name_jp)}, ${escapeSQL(card.type)}, ${escapeSQL(card.race)}, ${escapeSQL(card.attribute)}, ${card.level || 'NULL'}, ${card.atk || 'NULL'}, ${card.def || 'NULL'}, ${escapeSQL(card.desc_cn)})`;
  }).join(',\n');

  return `INSERT OR REPLACE INTO cards (id, name, name_cn, name_jp, type, race, attribute, level, atk, def, desc_cn) VALUES\n${values};`;
}

function main() {
  console.log('📖 读取卡牌数据...');
  const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf-8'));
  console.log(`📊 共 ${cards.length} 张卡牌`);

  // 创建输出目录
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const batches = [];
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    batches.push(cards.slice(i, i + BATCH_SIZE));
  }
  console.log(`📦 分成 ${batches.length} 批次 (每批 ${BATCH_SIZE} 张)`);

  // 生成 SQL 文件
  for (let i = 0; i < batches.length; i++) {
    const sql = generateInsertSQL(batches[i]);
    const sqlFile = path.join(OUTPUT_DIR, `batch_${String(i).padStart(3, '0')}.sql`);
    fs.writeFileSync(sqlFile, sql);
  }
  
  console.log(`✅ SQL 文件已生成到 ${OUTPUT_DIR}`);
  console.log('\n执行以下命令导入:');
  console.log(`cd ${path.join(__dirname, '..')} && for f in .tmp/batches/*.sql; do echo "导入 $f"; wrangler d1 execute mimi-yugioh-db --remote --file="$f" && sleep 1; done`);
}

main();
