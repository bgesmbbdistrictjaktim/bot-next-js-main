import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Return mock data for now
    const orders = [
      {
        id: '1',
        customer_name: 'Customer 1',
        customer_address: 'Address 1',
        contact: '08123456789',
        sto: 'CBB',
        transaction_type: 'new install',
        service_type: 'metro',
        status: 'Pending',
        created_at: new Date().toISOString()
      },
      {
        id: '2',
        customer_name: 'Customer 2',
        customer_address: 'Address 2',
        contact: '08987654321',
        sto: 'GAN',
        transaction_type: 'modify',
        service_type: 'Astinet',
        status: 'In Progress',
        created_at: new Date().toISOString()
      }
    ];

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}