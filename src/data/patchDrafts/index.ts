import type { PatchCategory } from '../../types';
import { PATCH_1_2_0 } from './v1.2.0';
import { DEVLOGS } from './devlogs';

/**
 * 미리 써 둔 패치노트·개발일지 (관리자 › 패치노트 › '준비된 글'에서 '추가하기'로 올림)
 * - 새 버전이면 v1.3.0.ts 처럼 파일을 하나 더 만들고 아래 목록에 넣으면 됨
 * - 이미 올린 글(같은 종류·버전·제목)은 목록에서 '추가됨'으로 보임
 */
export type PatchDraft = {
  key: string;
  version: string;
  category: PatchCategory;
  title: string;
  date: string;
  author: string;
  content: string;
  highlights: string[];
  kind?: string;
};

export const PATCH_DRAFTS: PatchDraft[] = [PATCH_1_2_0, ...DEVLOGS];
