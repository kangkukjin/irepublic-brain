import { NextRequest, NextResponse } from 'next/server';
import {
  getRecentPosts,
  getPostsByCategory,
  getPostsByYear,
  searchPosts,
  getStats,
} from '@/lib/firebase-db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const year = searchParams.get('year');
  const query = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '30');

  try {
    let posts;

    if (query) {
      posts = await searchPosts(query, limit);
    } else if (category) {
      posts = await getPostsByCategory(category, limit);
    } else if (year) {
      posts = await getPostsByYear(year, limit);
    } else {
      posts = await getRecentPosts(limit);
    }

    const stats = await getStats();

    return NextResponse.json({ posts, stats });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
