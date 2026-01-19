import { NextResponse } from 'next/server';
import { getYears } from '@/lib/firebase-db';

export async function GET() {
  try {
    const years = await getYears();
    return NextResponse.json({ years });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
