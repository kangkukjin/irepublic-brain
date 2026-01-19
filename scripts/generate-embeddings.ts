/**
 * 블로그 글 벡터 임베딩 생성 스크립트
 *
 * 사용법:
 * 1. OPENAI_API_KEY 환경변수 설정
 * 2. npx ts-node scripts/generate-embeddings.ts
 *
 * 출력:
 * - public/data/embeddings.json: 임베딩 데이터
 * - public/data/posts-meta.json: 글 메타데이터
 * - public/data/similarity-matrix.json: 사전 계산된 유사도 (top-k)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = '/Users/kangkukjin/Desktop/AI/indiebizOS/data/packages/installed/tools/blog/data/blog_insight.db';
const OUTPUT_DIR = path.join(process.cwd(), 'public/data');

interface Post {
  id: number;
  post_id: string;
  title: string;
  category: string;
  pub_date: string;
  content: string;
  char_count: number;
}

interface PostMeta {
  id: string;
  title: string;
  category: string;
  pub_date: string;
  char_count: number;
  excerpt: string;
}

interface EmbeddingData {
  id: string;
  embedding: number[];
}

interface SimilarityEntry {
  id: string;
  similar: { id: string; score: number }[];
}

// OpenAI 임베딩 API 호출
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // 토큰 제한
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// 배치 임베딩 (비용 효율성)
async function batchEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts.map(t => t.slice(0, 8000)),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

// 코사인 유사도 계산
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Top-K 유사 글 찾기
function findTopKSimilar(
  embeddings: Map<string, number[]>,
  targetId: string,
  k: number = 10
): { id: string; score: number }[] {
  const targetEmb = embeddings.get(targetId);
  if (!targetEmb) return [];

  const scores: { id: string; score: number }[] = [];

  for (const [id, emb] of embeddings) {
    if (id === targetId) continue;
    scores.push({ id, score: cosineSimilarity(targetEmb, emb) });
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, k);
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // DB 연결
  const db = new Database(DB_PATH, { readonly: true });

  // 모든 글 조회
  const posts = db.prepare(`
    SELECT id, post_id, title, category, pub_date, content, char_count
    FROM posts
    WHERE content IS NOT NULL AND content != ''
    ORDER BY pub_date DESC
  `).all() as Post[];

  console.log(`총 ${posts.length}개 글 처리 시작...`);

  // 메타데이터 추출
  const postMetas: PostMeta[] = posts.map(p => ({
    id: p.post_id,
    title: p.title,
    category: p.category || '미분류',
    pub_date: p.pub_date,
    char_count: p.char_count,
    excerpt: p.content.slice(0, 200).replace(/\n/g, ' '),
  }));

  // 임베딩 생성 (배치 처리)
  const BATCH_SIZE = 100;
  const embeddings = new Map<string, number[]>();

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const texts = batch.map(p => `${p.title}\n\n${p.content.slice(0, 6000)}`);

    console.log(`배치 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(posts.length / BATCH_SIZE)} 처리 중...`);

    try {
      const batchEmbedding = await batchEmbeddings(texts, apiKey);
      batch.forEach((p, idx) => {
        embeddings.set(p.post_id, batchEmbedding[idx]);
      });
    } catch (error) {
      console.error(`배치 ${i} 처리 실패:`, error);
      // 개별 처리 시도
      for (const p of batch) {
        try {
          const emb = await getEmbedding(`${p.title}\n\n${p.content.slice(0, 6000)}`, apiKey);
          embeddings.set(p.post_id, emb);
        } catch (e) {
          console.error(`글 ${p.post_id} 임베딩 실패:`, e);
        }
      }
    }

    // API 속도 제한 대응
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`${embeddings.size}개 임베딩 생성 완료`);

  // 유사도 매트릭스 생성 (Top-10)
  console.log('유사도 매트릭스 계산 중...');
  const similarityMatrix: SimilarityEntry[] = [];

  for (const [id] of embeddings) {
    const similar = findTopKSimilar(embeddings, id, 10);
    similarityMatrix.push({ id, similar });
  }

  // 파일 저장
  console.log('파일 저장 중...');

  // 메타데이터
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'posts-meta.json'),
    JSON.stringify(postMetas, null, 2)
  );

  // 임베딩 (압축용 - 소수점 4자리)
  const embeddingsArray: EmbeddingData[] = Array.from(embeddings.entries()).map(([id, emb]) => ({
    id,
    embedding: emb.map(v => Math.round(v * 10000) / 10000),
  }));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'embeddings.json'),
    JSON.stringify(embeddingsArray)
  );

  // 유사도 매트릭스
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'similarity-matrix.json'),
    JSON.stringify(similarityMatrix)
  );

  console.log('완료!');
  console.log(`- posts-meta.json: ${postMetas.length}개 글`);
  console.log(`- embeddings.json: ${embeddingsArray.length}개 임베딩`);
  console.log(`- similarity-matrix.json: ${similarityMatrix.length}개 유사도 엔트리`);

  db.close();
}

main().catch(console.error);
