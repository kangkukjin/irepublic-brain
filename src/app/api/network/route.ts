import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface Node {
  id: string;
  title: string;
  category: string;
  year: string;
  pub_date?: string;
  connections?: number;
}

interface Link {
  source: string;
  target: string;
  weight: number;
}

interface PostMeta {
  id: string;
  title: string;
  category: string;
  pub_date: string;
  char_count: number;
}

interface SimilarityEntry {
  id: string;
  similar: { id: string; score: number }[];
}

export async function GET() {
  try {
    // 데이터 파일 경로
    const dataDir = path.join(process.cwd(), 'public/data');

    // 메타데이터 로드
    const metaPath = path.join(dataDir, 'posts-meta.json');
    const metaData = await fs.readFile(metaPath, 'utf-8');
    const posts: PostMeta[] = JSON.parse(metaData);

    // 유사도 매트릭스 로드
    const simPath = path.join(dataDir, 'similarity-matrix.json');
    const simData = await fs.readFile(simPath, 'utf-8');
    const similarities: SimilarityEntry[] = JSON.parse(simData);

    // 유사도 맵 생성
    const simMap = new Map<string, SimilarityEntry['similar']>();
    for (const entry of similarities) {
      simMap.set(entry.id, entry.similar);
    }

    // 노드 생성 (최근 1000개만 시각화, 성능 위해)
    const recentPosts = posts.slice(0, 1000);
    const postIdSet = new Set(recentPosts.map(p => p.id));

    const nodes: Node[] = [];
    const connectionCount = new Map<string, number>();

    for (const post of recentPosts) {
      nodes.push({
        id: post.id,
        title: post.title,
        category: post.category || '미분류',
        year: post.pub_date?.slice(0, 4) || '미상',
        pub_date: post.pub_date,
      });
    }

    // 링크 생성 (유사도 0.5 이상인 것만)
    const links: Link[] = [];
    const linkSet = new Set<string>();

    for (const post of recentPosts) {
      const similar = simMap.get(post.id) || [];

      for (const sim of similar) {
        // 유사도 임계값
        if (sim.score < 0.5) continue;

        // 대상이 현재 시각화 범위 내에 있는지 확인
        if (!postIdSet.has(sim.id)) continue;

        // 중복 링크 방지
        const linkKey = [post.id, sim.id].sort().join('-');
        if (linkSet.has(linkKey)) continue;
        linkSet.add(linkKey);

        links.push({
          source: post.id,
          target: sim.id,
          weight: sim.score,
        });

        // 연결 수 카운트
        connectionCount.set(post.id, (connectionCount.get(post.id) || 0) + 1);
        connectionCount.set(sim.id, (connectionCount.get(sim.id) || 0) + 1);
      }
    }

    // 노드에 연결 수 추가
    for (const node of nodes) {
      node.connections = connectionCount.get(node.id) || 0;
    }

    return NextResponse.json({
      nodes,
      links,
      stats: {
        posts: nodes.length,
        connections: links.length,
        totalPosts: posts.length,
      },
    });
  } catch (error) {
    console.error('Network API Error:', error);

    // 파일이 없으면 기존 키워드 기반으로 폴백
    return NextResponse.json({
      nodes: [],
      links: [],
      stats: { posts: 0, connections: 0, totalPosts: 0 },
      error: 'Data files not found. Run generate-local-embeddings.py first.',
    });
  }
}
