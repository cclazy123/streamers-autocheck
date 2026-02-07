const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function uploadScreenshots() {
  console.log('Starting screenshot upload to Supabase...\n');

  // 查找所有 capture_*.png 文件
  const files = fs.readdirSync('.').filter(f => f.startsWith('capture_') && f.endsWith('.png'));
  
  if (files.length === 0) {
    console.log('No screenshots found to upload.');
    return;
  }

  console.log(`Found ${files.length} screenshots to upload:\n`);

  for (const filename of files) {
    try {
      const filePath = path.join('.', filename);
      const buffer = fs.readFileSync(filePath);
      
      // 提取用户名（从文件名）
      // 格式: capture_<method>_<username>.png
      const parts = filename.replace('capture_', '').replace('.png', '').split('_');
      const username = parts.slice(1).join('.');  // 跳过方法名称（canvas, clip, elem, full, mobile）
      
      // 确保账户存在
      const { data: existingAccount } = await supabase
        .from('accounts')
        .select('id')
        .eq('username', username)
        .single();

      if (!existingAccount) {
        console.log(`  Creating account: ${username}`);
        const { error: accountError } = await supabase
          .from('accounts')
          .insert([{ username }]);
        if (accountError && !accountError.message.includes('duplicate')) {
          throw new Error(`Failed to create account: ${accountError.message}`);
        }
      }
      
      const storagePath = `screenshots/${username}_${Date.now()}.png`;
      
      // 上传到 Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(storagePath, buffer, { 
          contentType: 'image/png',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 获取公开 URL
      const { data: urlData } = supabase.storage.from('screenshots').getPublicUrl(storagePath);
      const publicURL = urlData.publicUrl;

      // 插入元数据到 screenshots 表（使用 service role）
      const { data: inserted, error: insertError } = await supabase
        .from('screenshots')
        .insert([{
          username,
          storage_path: storagePath,
          public_url: publicURL
        }])
        .select();

      if (insertError) throw insertError;

      console.log(`✓ Uploaded: ${filename}`);
      console.log(`  Username: ${username}`);
      console.log(`  Storage: ${storagePath}`);
      console.log(`  URL: ${publicURL}\n`);

    } catch (err) {
      console.error(`✗ Failed to upload ${filename}:`, err.message);
      console.error();
    }
  }

  console.log('Upload complete!');
}

uploadScreenshots().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
