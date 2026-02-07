const { supabase, serviceSupabase } = require('./db');

async function ensureBucket(bucketName = 'screenshots') {
  const client = serviceSupabase || supabase;
  if (!client) return { ok: false, error: 'no supabase client available' };
  try {
    const { data, error } = await client.storage.createBucket(bucketName, { public: true });
    if (error) {
      const msg = error && error.message ? String(error.message) : '';
      if (msg.toLowerCase().includes('already exists') || (error.status === 409)) {
        return { ok: true, created: false };
      }
      return { ok: false, error };
    }
    return { ok: true, created: true, data };
  } catch (e) {
    return { ok: false, error: e };
  }
}

module.exports = { ensureBucket };
