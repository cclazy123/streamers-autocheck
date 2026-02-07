const { supabase, serviceSupabase } = require('./src/db');

async function testPermissions() {
  console.log('Testing Supabase permissions...\n');

  // Test 1: Check if service role is available
  console.log('1️⃣ Service Role Available:', !!serviceSupabase);
  console.log('2️⃣ Anon client available:', !!supabase);
  console.log();

  // Test 2: Try Insert with service role
  if (serviceSupabase) {
    console.log('Testing INSERT with service role...');
    const { data, error } = await serviceSupabase
      .from('screenshots')
      .insert([{
        username: 'test.account',
        storage_path: 'test/path.png',
        public_url: 'https://example.com/test.png'
      }])
      .select();

    if (error) {
      console.error('❌ Service role INSERT failed:', error.message);
    } else {
      console.log('✅ Service role INSERT succeeded!');
      console.log('  Inserted ID:', data[0]?.id);
    }
  } else {
    console.warn('⚠️  Service role not available');
  }

  // Test 3: Try INSERT with anon client
  console.log('\nTesting INSERT with anon client...');
  const { data: anonData, error: anonError } = await supabase
    .from('screenshots')
    .insert([{
      username: 'test.account2',
      storage_path: 'test/path2.png',
      public_url: 'https://example.com/test2.png'
    }])
    .select();

  if (anonError) {
    console.error('❌ Anon INSERT failed:', anonError.message);
  } else {
    console.log('✅ Anon INSERT succeeded!');
    console.log('  Inserted ID:', anonData[0]?.id);
  }

  // Test 4: Check accounts table
  console.log('\nQuerying accounts table...');
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('username')
    .limit(5);

  if (accountsError) {
    console.error('❌ Query accounts failed:', accountsError.message);
  } else {
    console.log('✅ Accounts found:', accounts.length);
    accounts.forEach(a => console.log(`   - ${a.username}`));
  }

  console.log('\nDone!');
  process.exit(0);
}

testPermissions().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
