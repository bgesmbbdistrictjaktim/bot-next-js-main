const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkTables() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('🔍 Checking orders table structure...');
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_id')
      .limit(3);

    if (ordersError) {
      console.log('❌ Orders error:', ordersError);
    } else {
      console.log('✅ Orders sample:');
      orders.forEach(order => {
        console.log(`  - id (UUID): ${order.id}`);
        console.log(`  - order_id (string): ${order.order_id}`);
      });
    }

    console.log('\n🔍 Checking order_stage_assignments table...');
    const { data: assignments, error: assignError } = await supabase
      .from('order_stage_assignments')
      .select('*')
      .limit(3);

    if (assignError) {
      console.log('❌ Assignments error:', assignError);
    } else {
      console.log('✅ Assignments sample:');
      assignments.forEach(assignment => {
        console.log(`  - order_id: ${assignment.order_id}`);
        console.log(`  - stage: ${assignment.stage}`);
        console.log(`  - assigned_technician: ${assignment.assigned_technician}`);
      });
    }

    // Check if there's a mismatch
    console.log('\n🔍 Checking for foreign key issues...');
    const { data: orderIds, error: orderIdsError } = await supabase
      .from('orders')
      .select('id, order_id');

    const { data: allAssignments, error: allAssignError } = await supabase
      .from('order_stage_assignments')
      .select('order_id, stage');

    if (!orderIdsError && !allAssignError && orderIds && allAssignments) {
      const validOrderIds = new Set(orderIds.map(o => o.id)); // UUIDs
      const validOrderStrings = new Set(orderIds.map(o => o.order_id)); // Strings like ORD-010

      console.log('📊 Valid order UUIDs:', validOrderIds.size);
      console.log('📊 Valid order strings:', validOrderStrings.size);
      console.log('📊 Assignment records:', allAssignments.length);

      const orphanAssignments = allAssignments.filter(assignment => 
        !validOrderIds.has(assignment.order_id) && !validOrderStrings.has(assignment.order_id)
      );

      console.log('🚨 Orphan assignments:', orphanAssignments.length);
      if (orphanAssignments.length > 0) {
        orphanAssignments.forEach(orphan => {
          console.log(`  - order_id: ${orphan.order_id}, stage: ${orphan.stage}`);
        });
      }
    }

  } catch (error) {
    console.error('💥 Error:', error);
  }
}

checkTables();