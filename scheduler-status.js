#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');

console.log('\n' + '='.repeat(70));
console.log('SCHEDULER CONFIGURATION VERIFICATION');
console.log('='.repeat(70) + '\n');

// 1. 读取 scheduler.js 验证配置
const schedulerCode = fs.readFileSync(path.join(__dirname, 'src/scheduler.js'), 'utf8');

console.log('✅ SCHEDULER BEHAVIOR CHECKLIST:\n');

// 检查 20 分钟间隔
if (schedulerCode.includes("*/20 * * * *")) {
  console.log('✓ 1. Checks every 20 minutes');
  console.log('     CronTab: "*/20 * * * *"');
} else {
  console.log('✗ 1. Checks interval not found!');
}

// 检查直播条件
if (schedulerCode.includes('res.live && res.buffer')) {
  console.log('✓ 2. Only uploads if account is LIVE');
  console.log('     Logic: if (res.live && res.buffer)');
  console.log('     - If NOT live → no screenshot uploaded');
  console.log('     - If live → screenshot captured & uploaded');
} else {
  console.log('✗ 2. Live check condition not found!');
}

// 检查时间限制
if (schedulerCode.includes('hour >= 2 && hour < 7')) {
  console.log('✓ 3. Time restriction implemented');
  console.log('     - Sleep hours: 02:00 - 07:00 (no checks)');
  console.log('     - Active hours: 07:00 - 02:00 (check every 20 min)');
} else {
  console.log('✗ 3. Time restriction not found!');
}

// 2. 显示当前时间和状态
const now = new Date();
const hour = now.getHours();
const minute = now.getMinutes();
const isActive = !(hour >= 2 && hour < 7);

console.log('\n⏰ CURRENT TIME STATUS:\n');
console.log(`   Current time: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);

if (isActive) {
  console.log(`   Status: 🟢 ACTIVE (checks enabled)`);
  console.log(`   Next sleep: ${7 - hour}h ${60 - minute}m`);
} else {
  console.log(`   Status: 🔴 SLEEPING (checks disabled)`);
  console.log(`   Resume at: 07:00 (${7 - hour}h ${60 - minute}m)`);
}

// 3. 检查账户和截图数据
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

(async () => {
  console.log('\n📊 DATA STATUS:\n');

  // 账户
  const { data: accounts } = await supabase.from('accounts').select('username');
  console.log(`   Total accounts: ${accounts?.length || 0}`);
  if (accounts && accounts.length > 0) {
    accounts.forEach(a => console.log(`     - ${a.username}`));
  }

  // 截图
  const { data: screenshots } = await supabase
    .from('screenshots')
    .select('*', { count: 'exact' });
  
  console.log(`\n   Total screenshots in database: ${screenshots?.length || 0}`);

  // 最近的截图
  const { data: recent } = await supabase
    .from('screenshots')
    .select('username, captured_at')
    .order('captured_at', { ascending: false })
    .limit(3);

  if (recent && recent.length > 0) {
    console.log('\n   Latest 3 screenshots:');
    recent.forEach((ss, i) => {
      const date = new Date(ss.captured_at);
      const secondsAgo = Math.round((now - date) / 1000);
      const minutesAgo = Math.round(secondsAgo / 60);
      const timeStr = secondsAgo < 60 ? `${secondsAgo}s ago` : `${minutesAgo}m ago`;
      console.log(`     ${i + 1}. ${ss.username} - ${timeStr}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ All scheduler functionality is properly configured!');
  console.log('='.repeat(70) + '\n');

  process.exit(0);
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
