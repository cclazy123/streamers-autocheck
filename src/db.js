const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) console.error('ERROR: SUPABASE_URL not set in .env');
if (!SUPABASE_ANON_KEY) console.error('ERROR: SUPABASE_ANON_KEY not set in .env');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || '');

let serviceSupabase = null;
if (SUPABASE_SERVICE_ROLE_KEY) {
  serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
} else {
  console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY not set; background uploads requiring admin rights may fail.');
}

module.exports = { supabase, serviceSupabase };
