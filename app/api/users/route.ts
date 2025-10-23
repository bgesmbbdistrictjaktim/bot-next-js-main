import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Return mock data for now
    const users = [
      {
        id: '1',
        name: 'John Doe',
        role: 'HD',
        telegram_id: '123456789'
      },
      {
        id: '2',
        name: 'Jane Smith',
        role: 'Teknisi',
        telegram_id: '987654321'
      }
    ];

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}