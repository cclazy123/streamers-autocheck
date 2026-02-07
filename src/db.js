const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) console.warn('SUPABASE_URL not set');
if (!SUPABASE_ANON_KEY) console.warn('SUPABASE_ANON_KEY not set');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || '');

let serviceSupabase = null;
if (SUPABASE_SERVICE_ROLE_KEY) {
  serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
} else {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not set; service client will be unavailable');
}

module.exports = { supabase, serviceSupabase };
