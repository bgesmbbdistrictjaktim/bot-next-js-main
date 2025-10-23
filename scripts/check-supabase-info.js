require('dotenv').config({ path: '.env.local' });

console.log('🔍 Supabase Connection Info:');
console.log('================================');

// Check environment variables
console.log('\n📋 Environment Variables:');
console.log(`NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);

if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.log(`\n🌐 Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  
  // Extract project ID from URL
  const urlParts = process.env.NEXT_PUBLIC_SUPABASE_URL.split('//')[1].split('.');
  const projectId = urlParts[0];
  console.log(`📝 Project ID: ${projectId}`);
  
  console.log(`\n🔗 Supabase Dashboard URL:`);
  console.log(`https://supabase.com/dashboard/project/${projectId}`);
  
  console.log(`\n📊 Database URL:`);
  console.log(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`);
  
  console.log(`\n🗄️ SQL Editor URL:`);
  console.log(`https://supabase.com/dashboard/project/${projectId}/sql`);
  
  console.log(`\n📦 Storage URL:`);
  console.log(`https://supabase.com/dashboard/project/${projectId}/storage`);
}

console.log('\n📱 Bot Connection Test:');
console.log('================================');

try {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  console.log('✅ Supabase client created successfully');
  
  // Test connection
  supabase.from('users').select('count').then(({ data, error }) => {
    if (error) {
      console.log('❌ Database connection failed:', error.message);
    } else {
      console.log('✅ Database connection successful');
    }
  });
  
} catch (error) {
  console.log('❌ Failed to create Supabase client:', error.message);
}

console.log('\n🔧 Troubleshooting Tips:');
console.log('================================');
console.log('1. Pastikan Anda login ke Supabase Dashboard');
console.log('2. Pastikan project masih aktif (tidak expired)');
console.log('3. Pastikan API keys masih valid');
console.log('4. Coba refresh browser dan login ulang');
console.log('5. Cek billing status di Supabase Dashboard');
