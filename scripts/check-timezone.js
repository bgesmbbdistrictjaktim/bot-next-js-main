const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTimezoneColumns() {
  try {
    console.log('🔍 Mengecek semua kolom timestamp di database...\n');

    // Query untuk mendapatkan semua kolom dengan tipe timestamp
    const { data: columns, error: columnsError } = await supabase
      .rpc('exec_sql', {
        sql_query: `
          SELECT 
            table_name,
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns 
          WHERE data_type IN ('timestamp without time zone', 'timestamp with time zone', 'timestamptz')
          AND table_schema = 'public'
          ORDER BY table_name, column_name;
        `
      });

    if (columnsError) {
      console.error('❌ Error mengecek kolom:', columnsError);
      
      // Fallback: cek manual tabel yang kita tahu
      console.log('📋 Mengecek tabel secara manual...\n');
      await checkKnownTables();
      return;
    }

    if (!columns || columns.length === 0) {
      console.log('ℹ️ Tidak ada kolom timestamp ditemukan atau menggunakan fallback method...\n');
      await checkKnownTables();
      return;
    }

    console.log('📊 Kolom timestamp yang ditemukan:');
    console.log('=====================================');
    
    for (const col of columns) {
      console.log(`📋 Tabel: ${col.table_name}`);
      console.log(`   📅 Kolom: ${col.column_name}`);
      console.log(`   🔧 Tipe: ${col.data_type}`);
      console.log(`   ❓ Nullable: ${col.is_nullable}`);
      console.log(`   🔄 Default: ${col.column_default || 'NULL'}`);
      console.log('');
    }

    // Cek sample data dari setiap tabel
    console.log('🔍 Mengecek sample data untuk melihat format timestamp...\n');
    await checkSampleData(columns);

  } catch (error) {
    console.error('❌ Error:', error);
    console.log('📋 Menggunakan fallback method...\n');
    await checkKnownTables();
  }
}

async function checkKnownTables() {
  const knownTables = [
    { table: 'orders', timestampColumns: ['created_at', 'updated_at'] },
    // progress (old) left for compatibility if exists
    { table: 'progress', timestampColumns: ['created_at', 'updated_at', 'timestamp'] },
    // progress_new is the active tracking table
    { table: 'progress_new', timestampColumns: ['created_at', 'updated_at'] },
    { table: 'order_stage_assignments', timestampColumns: ['created_at', 'updated_at'] },
    { table: 'users', timestampColumns: ['created_at', 'updated_at'] },
    // evidence uses uploaded_at
    { table: 'evidence', timestampColumns: ['uploaded_at'] }
  ];

  for (const tableInfo of knownTables) {
    console.log(`📋 Mengecek tabel: ${tableInfo.table}`);
    
    try {
      const { data, error } = await supabase
        .from(tableInfo.table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
        continue;
      }

      if (data && data.length > 0) {
        const record = data[0];
        console.log('   📅 Sample timestamps:');
        
        for (const col of tableInfo.timestampColumns) {
          if (record[col]) {
            const timestamp = new Date(record[col]);
            const jakartaTime = timestamp.toLocaleString('id-ID', {
              timeZone: 'Asia/Jakarta',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            });

            // Tampilkan ISO tanpa pecahan detik untuk konsistensi
            const isoSeconds = new Date(record[col]).toISOString().replace(/\.\d{3}Z$/, 'Z');
            console.log(`      ${col}: ${isoSeconds} (Jakarta: ${jakartaTime})`);
          }
        }
      } else {
        console.log('   ℹ️ Tidak ada data');
      }
      
      console.log('');
    } catch (err) {
      console.log(`   ❌ Error mengecek ${tableInfo.table}: ${err.message}`);
    }
  }
}

async function checkSampleData(columns) {
  const tableGroups = {};
  
  // Group columns by table
  columns.forEach(col => {
    if (!tableGroups[col.table_name]) {
      tableGroups[col.table_name] = [];
    }
    tableGroups[col.table_name].push(col.column_name);
  });

  // Check each table
  for (const [tableName, columnNames] of Object.entries(tableGroups)) {
    console.log(`📋 Sample data dari tabel: ${tableName}`);
    
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select(columnNames.join(', '))
        .limit(2);

      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
        continue;
      }

      if (data && data.length > 0) {
        data.forEach((record, index) => {
          console.log(`   📄 Record ${index + 1}:`);
          columnNames.forEach(col => {
            if (record[col]) {
              const timestamp = new Date(record[col]);
              const jakartaTime = timestamp.toLocaleString('id-ID', {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              });
              
              console.log(`      ${col}: ${record[col]}`);
              console.log(`      ${col} (Jakarta): ${jakartaTime}`);
            }
          });
        });
      } else {
        console.log('   ℹ️ Tidak ada data');
      }
      
      console.log('');
    } catch (err) {
      console.log(`   ❌ Error mengecek ${tableName}: ${err.message}`);
    }
  }
}

async function checkCurrentTimezone() {
  try {
    console.log('🌍 Mengecek timezone database saat ini...\n');
    
    const { data, error } = await supabase
      .rpc('exec_sql', {
        sql_query: `
          SELECT 
            name,
            setting,
            unit,
            context
          FROM pg_settings 
          WHERE name IN ('timezone', 'log_timezone');
        `
      });

    if (error) {
      console.log('❌ Error mengecek timezone:', error.message);
      return;
    }

    if (data && data.length > 0) {
      console.log('⚙️ Pengaturan timezone database:');
      data.forEach(setting => {
        console.log(`   ${setting.name}: ${setting.setting}`);
      });
    }

    // Cek current timestamp
    const { data: currentTime, error: timeError } = await supabase
      .rpc('exec_sql', {
        sql_query: `SELECT NOW() as current_time, NOW() AT TIME ZONE 'Asia/Jakarta' as jakarta_time;`
      });

    if (!timeError && currentTime && currentTime.length > 0) {
      console.log('\n🕐 Waktu saat ini:');
      console.log(`   Database: ${currentTime[0].current_time}`);
      console.log(`   Jakarta: ${currentTime[0].jakarta_time}`);
    }

  } catch (error) {
    console.log('❌ Error mengecek timezone:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 Memulai pengecekan timezone database...\n');
  
  await checkCurrentTimezone();
  console.log('\n' + '='.repeat(50) + '\n');
  await checkTimezoneColumns();
  
  console.log('✅ Pengecekan selesai!');
}

main().catch(console.error);