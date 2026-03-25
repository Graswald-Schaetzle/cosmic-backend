const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_KEY } = process.env;

const getSupabaseSettings = (token) => {
  if (token) {
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  } else {
    return createClient(SUPABASE_URL, SUPABASE_KEY);
  }
};

module.exports = { getSupabaseSettings };
