import { setCorsHeaders } from './_cors.js';

/**
 * 패치노트 목록 (GET /api/patch-notes)
 * - Firestore patch_notes (관리자 탭에서 작성) + Notion 데이터베이스(선택) 를 같은 양식으로 합쳐서 반환
 * - 서버(관리자 권한)에서 읽으므로 Firestore 규칙과 상관없이 모든 방문자에게 보임
 *
 * Notion 연동 (환경 변수 2개, 없으면 Notion 부분만 건너뜀)
 *   NOTION_TOKEN            Notion 내부 통합(Internal integration) 토큰
 *   NOTION_PATCH_NOTES_DB   패치노트 데이터베이스 ID (데이터베이스를 통합에 "연결" 해야 읽힘)
 * 데이터베이스 속성 (이름은 아래 중 하나면 자동 인식)
 *   제목(필수, 제목 속성) / 버전 / 분류(선택: 패치노트·핫픽스·업데이트·개발자 노트) / 날짜 / 하이라이트 / 작성자 / 공개(체크박스, 끄면 숨김)
 *   본문: 페이지 내용 (제목·목록·인용·코드·구분선 등) → 마크다운으로 변환
 */

const NOTION_VERSION = '2022-06-28';
const MAX_BLOCK_FETCH_PER_REQUEST = 12;

type Note = {
  id: string;
  version: string;
  title: string;
  category: 'patch' | 'hotfix' | 'update' | 'dev';
  date: string;
  content: string;
  highlights: string[];
  author: string;
  source?: 'firestore' | 'notion';
  updatedAt?: string;
};

const toIso = (v: any) => (v?.toDate ? v.toDate().toISOString() : typeof v === 'string' ? v : undefined);

async function notionFetch(path: string, token: string, body?: any) {
  const r = await fetch(`https://api.notion.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const json: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.message || `Notion HTTP ${r.status}`);
  return json;
}

function richText(rt: any[] = []): string {
  return rt
    .map((t: any) => {
      let s = String(t?.plain_text ?? '');
      if (!s) return '';
      const a = t?.annotations || {};
      if (a.code) s = `\`${s}\``;
      if (a.bold) s = `**${s}**`;
      if (a.italic) s = `*${s}*`;
      if (a.strikethrough) s = `~~${s}~~`;
      const href = t?.href || t?.text?.link?.url;
      if (href) s = `[${s}](${href})`;
      return s;
    })
    .join('');
}

function blockToMarkdown(b: any, indent = ''): string {
  const t = b?.type;
  const v = b?.[t] || {};
  const text = richText(v.rich_text);
  switch (t) {
    case 'paragraph': return text ? `${indent}${text}` : '';
    case 'heading_1': return `## ${text}`;
    case 'heading_2': return `### ${text}`;
    case 'heading_3': return `#### ${text}`;
    case 'bulleted_list_item': return `${indent}- ${text}`;
    case 'numbered_list_item': return `${indent}1. ${text}`;
    case 'to_do': return `${indent}- ${v.checked ? '[x]' : '[ ]'} ${text}`;
    case 'quote': return `> ${text}`;
    case 'callout': return `> ${v.icon?.emoji ? v.icon.emoji + ' ' : ''}${text}`;
    case 'toggle': return `${indent}- ${text}`;
    case 'code': return '```' + (v.language || '') + '\n' + richText(v.rich_text) + '\n```';
    case 'divider': return '---';
    case 'image': {
      const url = v.type === 'external' ? v.external?.url : v.file?.url;
      return url ? `![${richText(v.caption) || '이미지'}](${url})` : '';
    }
    case 'bookmark':
    case 'link_preview': return v.url ? `[${v.url}](${v.url})` : '';
    default: return text ? `${indent}${text}` : '';
  }
}

async function pageMarkdown(pageId: string, token: string): Promise<string> {
  const lines: string[] = [];
  let cursor: string | undefined;
  let guard = 0;
  do {
    const res = await notionFetch(`blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`, token);
    for (const b of res.results || []) {
      lines.push(blockToMarkdown(b));
      // 목록·토글의 하위 항목 한 단계까지
      if (b.has_children && ['bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle'].includes(b.type)) {
        try {
          const kids = await notionFetch(`blocks/${b.id}/children?page_size=100`, token);
          (kids.results || []).forEach((k: any) => lines.push(blockToMarkdown(k, '  ')));
        } catch {}
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor && ++guard < 5);
  // 목록끼리는 붙이고 나머지 블록 사이엔 빈 줄
  return lines
    .filter((l) => l !== '')
    .reduce((acc, line, i, arr) => {
      const isList = /^\s*(-|1\.)\s/.test(line);
      const prevList = i > 0 && /^\s*(-|1\.)\s/.test(arr[i - 1]);
      return acc + (i === 0 ? '' : isList && prevList ? '\n' : '\n\n') + line;
    }, '');
}

function findProp(props: Record<string, any>, types: string[], names: RegExp) {
  return Object.entries(props).find(([name, p]: [string, any]) => types.includes(p?.type) && names.test(name))?.[1];
}

function propText(p: any): string {
  if (!p) return '';
  switch (p.type) {
    case 'title': return richText(p.title).replace(/\*\*/g, '');
    case 'rich_text': return p.rich_text.map((t: any) => t.plain_text).join('');
    case 'select': return p.select?.name || '';
    case 'status': return p.status?.name || '';
    case 'multi_select': return (p.multi_select || []).map((x: any) => x.name).join(', ');
    case 'people': return (p.people || []).map((x: any) => x.name).filter(Boolean).join(', ');
    case 'number': return p.number != null ? String(p.number) : '';
    case 'date': return p.date?.start || '';
    default: return '';
  }
}

function mapCategory(raw: string): Note['category'] {
  const s = raw.toLowerCase();
  if (/핫픽스|hotfix/.test(s)) return 'hotfix';
  if (/업데이트|update/.test(s)) return 'update';
  if (/개발|dev/.test(s)) return 'dev';
  return 'patch';
}

async function loadNotionNotes(db: any): Promise<{ notes: Note[]; error?: string; enabled: boolean }> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_PATCH_NOTES_DB;
  if (!token || !dbId) return { notes: [], enabled: false };
  try {
    const pages: any[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const res = await notionFetch(`databases/${dbId}/query`, token, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      pages.push(...(res.results || []));
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor && ++guard < 5);

    const notes: Note[] = [];
    let fetched = 0;
    for (const page of pages) {
      if (page.archived || page.in_trash) continue;
      const props = page.properties || {};
      const publish = findProp(props, ['checkbox'], /공개|게시|publish|visible/i);
      if (publish && publish.checkbox === false) continue;
      const title = propText(Object.values(props).find((p: any) => p?.type === 'title'));
      if (!title) continue;
      const version = propText(findProp(props, ['rich_text', 'number', 'select'], /버전|version|ver/i)).replace(/^v/i, '');
      const category = mapCategory(propText(findProp(props, ['select', 'status', 'multi_select'], /분류|카테고리|category|type|유형|종류/i)));
      const date = (propText(findProp(props, ['date'], /날짜|date|배포|게시일/i)) || page.created_time || '').slice(0, 10);
      const highlightsRaw = propText(findProp(props, ['rich_text', 'multi_select'], /하이라이트|요약|highlight|주요/i));
      const highlights = highlightsRaw.split(/\n|,|·/).map((x) => x.trim()).filter(Boolean).slice(0, 8);
      const author = propText(findProp(props, ['rich_text', 'people', 'select'], /작성자|author|글쓴이/i)) || '운영진';

      // 본문은 마지막 수정 시각이 바뀐 페이지만 다시 읽음 (Firestore 캐시)
      const cacheRef = db.collection('notion_cache').doc(page.id);
      const cache = (await cacheRef.get()).data();
      let content = cache?.lastEdited === page.last_edited_time ? cache?.markdown || '' : null;
      if (content === null) {
        if (fetched >= MAX_BLOCK_FETCH_PER_REQUEST) {
          content = cache?.markdown || '';
        } else {
          fetched++;
          content = await pageMarkdown(page.id, token);
          await cacheRef.set({ lastEdited: page.last_edited_time, markdown: content, updatedAt: new Date().toISOString() });
        }
      }

      notes.push({
        id: `notion-${page.id.replace(/-/g, '')}`,
        version: version || '0.0.0',
        title,
        category,
        date,
        content: content || '',
        highlights,
        author,
        source: 'notion',
        updatedAt: page.last_edited_time,
      });
    }
    return { notes, enabled: true };
  } catch (e: any) {
    return { notes: [], enabled: true, error: e?.message || String(e) };
  }
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db } = await import('./_firebase.js');
    const snap = await db.collection('patch_notes').get();
    const fsNotes: Note[] = snap.docs.map((d: any) => {
      const x = d.data() || {};
      return {
        id: d.id,
        version: x.version || '0.0.0',
        title: x.title || '패치노트',
        category: x.category || 'patch',
        date: x.date || '',
        content: x.content || '',
        highlights: Array.isArray(x.highlights) ? x.highlights : [],
        author: x.author || '운영진',
        source: 'firestore',
        updatedAt: toIso(x.updatedAt) || toIso(x.createdAt),
      };
    });

    const notion = await loadNotionNotes(db);
    // 같은 버전이 양쪽에 있으면 Notion 쪽을 사용
    const notionVersions = new Set(notion.notes.map((n) => n.version).filter((v) => v && v !== '0.0.0'));
    const merged = [...fsNotes.filter((n) => !notionVersions.has(n.version)), ...notion.notes]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.version || '').localeCompare(a.version || '', undefined, { numeric: true }));

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      notes: merged,
      counts: { firestore: fsNotes.length, notion: notion.notes.length },
      notion: { enabled: notion.enabled, error: notion.error || null },
    });
  } catch (e: any) {
    console.error('[patch-notes] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
