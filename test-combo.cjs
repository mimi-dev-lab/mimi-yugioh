/**
 * 测试展开分析器 (纯 JS)
 */

const fs = require('fs');
const path = require('path');

// 加载 combo 数据
const rawData = JSON.parse(fs.readFileSync('./data/branded_bystial_en.json', 'utf-8'));
const COMBOS = rawData.combos;

// 卡片分类
const STARTERS = [
  'Aluber the Jester of Despia',
  'Branded Fusion',
  'Blazing Cartesia, the Virtuous',
  'Guiding Quem, the Virtuous',
  'Nadir Servant',
  'Bystial Magnamhut',
  'Bystial Saronir',
  'Fusion Deployment',
];

const HANDTRAPS = [
  'Ash Blossom',
  'Maxx "C"',
  'Infinite Impermanence',
  'Effect Veiler',
  'Nibiru',
  'Ghost Ogre',
  'Droll & Lock Bird',
  'Called by the Grave',
];

function categorize(hand) {
  const starters = hand.filter(c => STARTERS.some(s => c.toLowerCase().includes(s.toLowerCase().split(' ')[0])));
  const handtraps = hand.filter(c => HANDTRAPS.some(h => c.toLowerCase().includes(h.toLowerCase().split(' ')[0])));
  const unknown = hand.filter(c => !starters.includes(c) && !handtraps.includes(c));
  return { starters, handtraps, unknown };
}

function matchesCombo(hand, combo) {
  return combo.starting_hand.every(required => {
    if (required.toLowerCase().includes('any card')) {
      return hand.length > 1;
    }
    const reqLower = required.toLowerCase();
    return hand.some(h => 
      h.toLowerCase().includes(reqLower.split(' ')[0]) || 
      reqLower.includes(h.toLowerCase().split(' ')[0])
    );
  });
}

function analyzeHand(hand) {
  console.log('━'.repeat(60));
  console.log(`📋 Hand: ${hand.join(', ')}`);
  console.log('━'.repeat(60));
  
  const cat = categorize(hand);
  console.log(`   Starters: ${cat.starters.join(', ') || 'None'}`);
  console.log(`   Handtraps: ${cat.handtraps.join(', ') || 'None'}`);
  
  const available = COMBOS.filter(c => matchesCombo(hand, c));
  
  if (available.length === 0) {
    console.log('\n   ❌ No combo available\n');
    return;
  }
  
  const best = available.sort((a, b) => {
    if (a.combo_type !== b.combo_type) {
      return a.combo_type === 'double' ? -1 : 1;
    }
    return b.end_board.negates - a.end_board.negates;
  })[0];
  
  console.log(`\n   ✅ Best: ${best.combo_name}`);
  console.log(`   End board: ${best.end_board.monsters.join(' + ')}`);
  console.log(`   Negates: ${best.end_board.negates}`);
  
  console.log('\n   📝 Steps:');
  best.steps.forEach(s => {
    console.log(`      ${s.order}. [${s.card}]`);
    console.log(`         ${s.description}`);
  });
  console.log('');
}

// ============ 测试 ============
console.log('\n🎴 Branded Bystial Combo Analyzer\n');

analyzeHand(['Aluber', 'Ash Blossom', 'Maxx "C"', 'Impermanence', 'Called by']);

analyzeHand(['Branded Fusion', 'Ash Blossom', 'Veiler', 'Nibiru', 'Ghost Ogre']);

analyzeHand(['Cartesia', 'Saronir', 'Ash Blossom', 'Maxx "C"', 'Droll']);

analyzeHand(['Ash Blossom', 'Maxx "C"', 'Impermanence', 'Veiler', 'Nibiru']);

analyzeHand(['Nadir Servant', 'Ash Blossom', 'Maxx "C"', 'Called by', 'Impermanence']);

console.log('✅ Done\n');
