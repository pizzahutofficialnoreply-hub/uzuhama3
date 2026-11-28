import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Pointer, Compass } from 'lucide-react';
import type { Tab } from '../types';
import { INSTALL_SEEN_KEY, needsIOSInstall, openSetupGuide } from '../utils/setupStatus';
import { fullHeight, bottomBase } from '../utils/viewport';

/**
 * 처음 방문한 사람을 위한 둘러보기
 * - 환영 화면 → 화면 아무 곳이나 누르면 다음 단계
 * - 각 단계마다 실제 화면 요소 위치를 재서(화면 비율과 상관없이) 그 부분만 밝게 뚫고 테두리로 강조
 * - 탭바 단계에서는 탭을 실제로 넘겨 보이는 시연, 확률 단계에서는 '자세히 보기'를 직접 열어 보임
 * - 한 번 끝내거나 건너뛰면 다시 안 뜸 (설정에서 다시 보기 가능). 관리자가 전체 차단 가능 (system.tutorialEnabled = false)
 */

export const TUTORIAL_DONE_KEY = 'uzuhama_tutorial_done_v1';
/** 새 기능 둘러보기 (예전 둘러보기를 본 사람에게 한 번): 버전이 바뀌면 이름을 바꿔 다시 */
export const TUTORIAL_NEW_KEY = 'uzuhama_tutorial_new_1.3.0';
const NEW_VERSION = '1.3.0';
export const TUTORIAL_START_EVENT = 'uzuhama-start-tutorial';

type Step = {
  id: string;
  title: string;
  body: string;
  /** 강조할 요소 (모바일/PC 각각, 쉼표로 여러 후보) — 없으면 가운데 카드 */
  target?: { mobile?: string; desktop?: string };
  /** 이 단계 들어올 때 맞춰 둘 탭 */
  tab?: Tab;
  scrollTop?: boolean;
  /**
   * 직접 해 보는 단계: 강조된 부분만 누를 수 있고, 조건이 맞으면 다음 설명으로 자동 진행
   * (아무 곳이나 눌러 넘기는 일반 단계와 구분)
   */
  action?: { hint: string; done: (ctx: { activeTab: Tab }) => boolean; reset?: () => void };
  /** 설정 패널처럼 안쪽에서 스크롤되는 곳의 요소: 그 상자 안에서 보이게 스크롤 */
  scrollIntoView?: boolean;
  /** 말풍선 안의 버튼 (예: 설치 방법 보기, 알림 켜기) */
  extra?: { label: string; onClick: () => void };
  /** 이 단계에 들어오면 설정 패널을 닫음 */
  closeSettings?: boolean;
  /** 말풍선 위 작은 묶음 이름 (예: 방송 예측, 영상) */
  chapter?: string;
  /** 새 기능 (말풍선에 '새 기능' 표시, 새 기능 둘러보기에 들어감) */
  isNew?: boolean;
  /** 새 기능 둘러보기에도 넣음 (새 기능으로 가는 길: 탭 이동·설정 열기) */
  inNew?: boolean;
  /** 둘러보기 시작할 때 화면에 이게 있어야만 넣음 (예: 연말 결산 카드는 12월 중순~1월 중순에만) */
  onlyIf?: () => boolean;
};

// 같은 요소가 모바일·PC 용으로 두 번 있을 수 있어서, 화면에 보이는 것만 봄
const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].some((el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
});
const IOS_INSTALL_FIRST = needsIOSInstall();

const detailsOpen = () => document.querySelector('[data-tour="prob-details"]')?.getAttribute('aria-expanded') === 'true';
const closeDetails = () => {
  const btn = document.querySelector<HTMLButtonElement>('[data-tour="prob-details"]');
  if (btn?.getAttribute('aria-expanded') === 'true') btn.click();
};

// ── 직접 해 보기 도우미 ──
// 어느 묶음(data-tour)을 마지막으로 눌렀는지 기록 → '눌러 보세요' 단계가 끝났는지 앎
const tappedAt: Record<string, number> = {};
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('[data-tour]');
    if (el) tappedAt[el.getAttribute('data-tour') || ''] = Date.now();
  }, true);
}
const snap: { t0: number; text?: string } = { t0: 0 };
const mark = (text?: string) => { snap.t0 = Date.now(); snap.text = text; };
const tapped = (group: string) => (tappedAt[group] || 0) > snap.t0;
const textOf = (sel: string) => document.querySelector(sel)?.textContent?.slice(0, 120) || '';
const cardLabel = () => document.querySelector('[data-testid="ai-card"]')?.getAttribute('aria-label') || '';
const blurInput = () => { (document.activeElement as HTMLElement | null)?.blur?.(); };
const SPEED_PILL = '[aria-label="2배속"], [aria-label="2배속 고정 해제"]';
const SHORTS = '[role="dialog"][aria-label="쇼츠 보기"]';
// 펼친 카드가 열린 채면(다른 걸 누르다 열린 경우 등) 닫고 다음 단계로
const closeCard = () => { if (visible('[data-testid="ai-card"]')) document.querySelector<HTMLElement>('[data-tour="card-close"]')?.click(); };
let lpSeen = false;

// 누구나 아는 건 짧게, 숨은 기능은 직접 눌러 보며 알아가도록 (단계 번호 없이, 하나씩 직접 해 보기)
const STEPS: Step[] = [
  {
    id: 'welcome',
    title: '우주하마 방송 예측에 오신 걸 환영해요',
    body: '하나씩 직접 눌러 보면서 알려 드릴게요. 해 보라는 걸 하면 저절로 다음으로 넘어가요.\n언제든 오른쪽 위 X로 닫을 수 있어요.',
  },
  {
    id: 'prob',
    chapter: '방송 예측',
    title: '지금 방송이 켜질 확률',
    body: '요일, 최근 방송 간격, 평소 시작 시간을 보고 1분마다 다시 계산해요.',
    target: { mobile: '#current-prob-card, #current-prob-live-card', desktop: '#current-prob-card, #current-prob-live-card' },
    tab: 'summary',
    scrollTop: true,
  },
  {
    id: 'details-try',
    chapter: '방송 예측',
    title: '어떻게 나온 숫자인지 볼까요?',
    body: '',
    target: { mobile: '[data-tour="prob-details"]', desktop: '[data-tour="prob-details"]' },
    tab: 'summary',
    action: { hint: "'확률 계산 자세히 보기'를 눌러 보세요", done: () => detailsOpen(), reset: closeDetails },
  },
  {
    id: 'details',
    chapter: '방송 예측',
    title: '단계별 계산',
    body: '요일 → 방송 간격 → 휴방 여부 → 남은 시간 순서로 확률이 바뀌는 과정이에요. 마지막 줄이 위의 큰 숫자와 같아요.',
    target: { mobile: '[data-tour="prob-details-area"]', desktop: '[data-tour="prob-details-area"]' },
    tab: 'summary',
  },
  {
    id: 'title-egg',
    chapter: '방송 예측',
    title: '제목 옆 그림을 세 번 눌러 보세요',
    body: '기념일·수능·할로윈·추석 같은 날에는 제목 글씨체와 그림이 바뀌어요. 그림을 빠르게 세 번 누르면 숨은 장면이 나와요.',
    target: { mobile: 'header h1 [role="img"], header h1 .title-decor', desktop: 'header h1 [role="img"], header h1 .title-decor' },
    tab: 'summary',
    scrollTop: true,
    onlyIf: () => visible('header h1 [role="img"], header h1 .title-decor'),
  },
  {
    id: 'recap',
    chapter: '방송 예측',
    title: '올해의 연말 결산',
    body: '한 해 방송을 한 장씩 돌아봐요. 가장 많이 한 게임은 눌러서 바로 볼 수 있고, ⋯ 에서 사진으로 저장하거나 틀린 곳을 알려 줄 수 있어요.',
    target: { mobile: '[data-testid="recap-banner"]', desktop: '[data-testid="recap-banner"]' },
    tab: 'summary',
    onlyIf: () => visible('[data-testid="recap-banner"]'),
  },
  {
    id: 'tab-try',
    chapter: '방송 기록',
    title: '방송 기록으로 가 볼까요?',
    body: '',
    target: { mobile: 'nav[aria-label="하단 네비게이션"]', desktop: '#desktop-tab-bar' },
    tab: 'summary',
    action: {
      hint: "탭바에서 '기록'을 눌러 보세요. 회색 동그라미를 옆으로 끌어도 넘어가요",
      done: ({ activeTab }) => activeTab === 'calendar',
    },
  },
  {
    id: 'cal-month-try',
    chapter: '방송 기록',
    title: '다른 달로 넘겨 보기',
    body: '',
    target: { mobile: '[data-tour="cal-month-nav"]', desktop: '[data-tour="cal-month-nav"]' },
    tab: 'calendar',
    action: {
      hint: "화살표를 눌러 방송한 날(색칠된 칸)이 있는 달로 가 보세요",
      reset: () => mark(textOf('[data-tour="cal-month-nav"]')),
      done: () => textOf('[data-tour="cal-month-nav"]') !== snap.text && visible('[data-testid="cal-day"][data-has-log="1"]'),
    },
  },
  {
    id: 'cal-day-try',
    chapter: '방송 기록',
    title: '방송한 날을 눌러 보세요',
    body: '',
    target: { mobile: '[data-testid="cal-day"][data-has-log="1"]', desktop: '[data-testid="cal-day"][data-has-log="1"]' },
    tab: 'calendar',
    action: {
      hint: '색칠된 날짜 하나를 눌러 보세요',
      reset: () => mark(textOf('#calendar-detail-panel')),
      done: () => visible('#calendar-detail-panel') && textOf('#calendar-detail-panel') !== snap.text,
    },
  },
  {
    id: 'calendar',
    chapter: '방송 기록',
    title: '그날 방송이 한곳에',
    body: '그날 한 게임, 다시보기, 편집 영상, 쇼츠가 모여 있어요. 게임 그림을 누르면 게임 페이지로, 영상을 누르면 사이트 안에서 바로 펼쳐져요.',
    target: { mobile: '#calendar-detail-panel', desktop: '#calendar-detail-panel' },
    tab: 'calendar',
  },
  {
    id: 'calendar-export',
    chapter: '방송 기록',
    title: '내 캘린더에 넣기',
    body: "'캘린더 구독'을 하면 새 방송이 기록될 때마다 아이폰·구글 캘린더에 자동으로 들어와요. 한 방송만 넣고 싶으면 위 달력에서 그 날짜를 눌러 등록해요.",
    target: { mobile: '[data-tour="calendar-export"]', desktop: '[data-tour="calendar-export"]' },
    tab: 'calendar',
  },
  {
    id: 'detailed-try',
    chapter: '분석',
    inNew: true,
    title: '이번엔 분석 탭',
    body: '',
    target: { mobile: 'nav[aria-label="하단 네비게이션"]', desktop: '#desktop-tab-bar' },
    tab: 'calendar',
    action: { hint: "'분석'을 눌러 보세요", done: ({ activeTab }) => activeTab === 'detailed' },
  },
  {
    id: 'stats-range-try',
    chapter: '분석',
    title: '기간 바꿔 보기',
    body: '',
    target: { mobile: '[data-tour="stats-presets"]', desktop: '[data-tour="stats-presets"]' },
    tab: 'detailed',
    action: { hint: "'최근 30일'처럼 다른 기간을 눌러 보세요. 아래 숫자·그래프가 다 바뀌어요", reset: () => mark(), done: () => tapped('stats-presets') },
  },
  {
    id: 'stats-sub-try',
    chapter: '분석',
    title: '요일·시간 보기',
    body: '',
    target: { mobile: '[data-tour="stats-subtabs"]', desktop: '[data-tour="stats-subtabs"]' },
    tab: 'detailed',
    action: { hint: "'요일별 분석'을 눌러 보세요", done: () => visible('#broadcast-heatmap-board') },
  },
  {
    id: 'heatmap',
    chapter: '분석',
    isNew: true,
    title: '방송 활동 히트맵',
    body: '칸 하나가 하루예요. 색이 진할수록 오래 방송했어요. 칸을 누르면 그날 방송 시간이 나오고, 기간은 위에서 고른 기간을 그대로 따라가요.',
    target: { mobile: '#broadcast-heatmap-board', desktop: '#broadcast-heatmap-board' },
    tab: 'detailed',
  },
  {
    id: 'search-try',
    chapter: '영상',
    inNew: true,
    title: '영상 찾기',
    body: '',
    target: { mobile: 'button[aria-label="영상 검색 및 추천"]', desktop: '#desktop-tab-bar > button:nth-of-type(4)' },
    tab: 'detailed',
    action: { hint: '돋보기를 눌러 보세요', done: ({ activeTab }) => activeTab === 'recommend' },
  },
  {
    id: 'search',
    chapter: '영상',
    title: '영상은 여기서',
    body: "홈 · 동영상 · Shorts · 라이브 · 재생목록으로 나뉘어 있어요. '무서운 거 보여줘'처럼 말하듯 써도 되고, 배그·옵치 같은 줄임말이나 유튜브·치지직 링크로도 찾아 줘요.",
    target: { mobile: '#recommend-cards-top', desktop: '#recommend-cards-top' },
    tab: 'recommend',
    scrollTop: true,
  },
  {
    id: 'search-type-try',
    chapter: '영상',
    title: '검색해 보기',
    body: '',
    target: { mobile: 'input[placeholder="영상 및 방송 검색..."]', desktop: 'input[placeholder="영상 및 방송 검색..."]' },
    tab: 'recommend',
    action: {
      hint: "검색창에 '공포'를 쳐 보세요",
      done: () => [...document.querySelectorAll<HTMLInputElement>('input[placeholder="영상 및 방송 검색..."]')].some((i) => i.value.trim().length >= 2),
    },
  },
  {
    id: 'view-toggle-try',
    chapter: '영상',
    title: '카드로도, 목록으로도',
    body: '',
    target: { mobile: '[role="group"][aria-label="보기 방식"]', desktop: '[role="group"][aria-label="보기 방식"]' },
    tab: 'recommend',
    action: { hint: "'카드'나 '목록'을 눌러 보는 방식을 바꿔 보세요", reset: () => { blurInput(); mark(); }, done: () => tapped('view-style') },
  },
  {
    id: 'card-open-try',
    chapter: '영상',
    inNew: true,
    title: '사이트 안에서 펼쳐 보기',
    body: '',
    target: { mobile: '#recommend-tab-view [data-thumb]', desktop: '#recommend-tab-view [data-thumb]' },
    tab: 'recommend',
    action: { hint: '영상 썸네일을 눌러 보세요. 화면이 펼쳐지며 바로 재생돼요', reset: blurInput, done: () => visible('[data-testid="ai-card"]') },
  },
  {
    id: 'card-speed-try',
    chapter: '영상',
    isNew: true,
    title: '꾹 눌러 2배속',
    body: '영상 양옆을 두 번 톡 치면 10초씩 앞뒤로 가요.',
    target: { mobile: '[data-testid="ai-card-player"]', desktop: '[data-testid="ai-card-player"]' },
    action: { hint: '영상 왼쪽이나 오른쪽 끝을 꾹 눌러 보세요. 누른 채 아래로 당기면 2배속이 고정돼요', done: () => visible(SPEED_PILL) },
  },
  {
    id: 'card-summary-try',
    chapter: '영상',
    title: 'AI 요약과 대사',
    body: '',
    target: { mobile: '[data-tour="card-summary"]', desktop: '[data-tour="card-summary"]' },
    scrollIntoView: true,
    action: {
      hint: "'AI 영상 요약'을 눌러 펼쳐 보세요. 시간을 누르면 그 장면으로 가요",
      done: () => document.querySelector('[data-tour="card-summary"]')?.getAttribute('data-open') === '1',
    },
  },
  {
    id: 'card-other-try',
    chapter: '영상',
    isNew: true,
    title: '이 방송의 다른 영상',
    body: '',
    target: { mobile: '[data-testid="ai-card"] [data-lp]', desktop: '[data-testid="ai-card"] [data-lp]' },
    scrollIntoView: true,
    action: { hint: '아래 생방송이나 다른 영상을 눌러 보세요. 이 카드가 그 영상으로 바뀌어요', reset: () => mark(cardLabel()), done: () => visible('[data-testid="ai-card"]') && cardLabel() !== snap.text },
  },
  {
    id: 'card-close-try',
    chapter: '영상',
    inNew: true,
    title: '닫기',
    body: '',
    target: { mobile: '[data-tour="card-close"]', desktop: '[data-tour="card-close"]' },
    action: { hint: 'X를 눌러 닫아 보세요. 아래로 끌어내려도 돼요. 재생 중이면 썸네일 자리에서 계속 나와요', done: () => !visible('[data-testid="ai-card"]') },
  },
  {
    id: 'lp-try',
    chapter: '영상',
    isNew: true,
    title: '꾹 눌러 미리보기',
    body: '',
    target: { mobile: '#recommend-tab-view [data-lp]', desktop: '#recommend-tab-view [data-lp]' },
    tab: 'recommend',
    action: {
      hint: '영상을 꾹 눌러 미리보기를 띄운 다음, 바깥을 눌러 닫아 보세요',
      reset: () => { lpSeen = false; closeCard(); },
      done: () => { if (visible('[data-lp-layer]')) lpSeen = true; return lpSeen && !visible('[data-lp-layer]'); },
    },
  },
  {
    id: 'video-swipe',
    chapter: '영상',
    title: '옆으로 밀어서 바로',
    body: '영상 카드나 목록 줄을 오른쪽으로 밀면 저장, 왼쪽으로 밀면 공유·신고예요. 끝까지 밀면 바로 실행돼요.',
    target: { mobile: '[data-swipe-row]', desktop: '[data-swipe-row]' },
    tab: 'recommend',
  },
  {
    id: 'shorts-tab-try',
    chapter: '쇼츠',
    inNew: true,
    title: '쇼츠 보기',
    body: '',
    target: { mobile: '#rec-subtab-shorts', desktop: '#rec-subtab-shorts' },
    tab: 'recommend',
    scrollTop: true,
    action: { hint: "'Shorts'를 눌러 보세요", reset: closeCard, done: () => document.querySelector('#rec-subtab-shorts')?.getAttribute('aria-selected') === 'true' },
  },
  {
    id: 'shorts-open-try',
    chapter: '쇼츠',
    inNew: true,
    title: '쇼츠 하나 열기',
    body: '',
    target: { mobile: '[data-tour="shorts-card"]', desktop: '[data-tour="shorts-card"]' },
    tab: 'recommend',
    action: { hint: '쇼츠를 눌러 보세요. 위아래로 밀면 다음 쇼츠예요', done: () => visible(SHORTS) },
  },
  {
    id: 'shorts-speed-try',
    chapter: '쇼츠',
    isNew: true,
    title: '2배속과 진행바',
    body: '맨 아래 진행바를 끌면 원하는 곳으로 가요. 가운데를 꾹 누르면 저장·공유 메뉴예요.',
    target: { mobile: '[role="dialog"][aria-label="쇼츠 보기"]', desktop: '[role="dialog"][aria-label="쇼츠 보기"]' },
    action: { hint: '화면 왼쪽이나 오른쪽 끝을 꾹 눌러 보세요', done: () => visible(SPEED_PILL) },
  },
  {
    id: 'shorts-close-try',
    chapter: '쇼츠',
    inNew: true,
    title: '쇼츠 닫기',
    body: '',
    target: { mobile: '[role="dialog"][aria-label="쇼츠 보기"] button[aria-label="닫기"]', desktop: '[role="dialog"][aria-label="쇼츠 보기"] button[aria-label="닫기"]' },
    action: { hint: '왼쪽 위 X를 눌러 닫아 보세요', done: () => !visible(SHORTS) },
  },
  {
    id: 'settings-try',
    chapter: '설정',
    inNew: true,
    title: '마지막으로 설정',
    body: '',
    target: { mobile: '#header-settings-btn', desktop: '#header-settings-btn' },
    tab: 'summary',
    scrollTop: true,
    action: { hint: '오른쪽 위 톱니바퀴(설정)를 눌러 보세요', done: () => visible('[data-tour="settings-notify"]') },
  },
  IOS_INSTALL_FIRST
    ? {
        id: 'settings-notify',
        chapter: '설정',
        title: '아이폰은 앱 설치가 먼저예요',
        body: '아이폰은 홈 화면에 추가한 앱에서만 방송 알림이 와요. 설치하고 그 앱으로 열면 여기서 알림을 켤 수 있어요.',
        target: { mobile: '[data-tour="settings-notify"]', desktop: '[data-tour="settings-notify"]' },
        scrollIntoView: true,
        extra: { label: '설치 방법 보기', onClick: () => { try { sessionStorage.setItem(INSTALL_SEEN_KEY, '1'); } catch { /* 무시 */ } openSetupGuide('install'); } },
      }
    : {
        id: 'settings-notify',
        chapter: '설정',
        title: '여기서 알림을 켜요',
        body: '방송 시작, 휴방 공지, 오늘 유력 시간 몇 분 전 알림을 골라서 켤 수 있어요.',
        target: { mobile: '[data-tour="settings-notify"]', desktop: '[data-tour="settings-notify"]' },
        scrollIntoView: true,
        extra: { label: '지금 알림 켜기', onClick: () => openSetupGuide('notify') },
      },
  {
    id: 'theme-open-try',
    chapter: '설정',
    title: '화면 설정',
    body: '',
    target: { mobile: '[data-settings-section="theme"]', desktop: '[data-settings-section="theme"]' },
    scrollIntoView: true,
    action: { hint: "'화면 설정'을 눌러 열어 보세요", done: () => visible('[data-tour="settings-font"]') },
  },
  {
    id: 'theme-try',
    chapter: '설정',
    title: '밝게 · 어둡게',
    body: '',
    target: { mobile: '[data-tour="settings-theme"]', desktop: '[data-tour="settings-theme"]' },
    scrollIntoView: true,
    action: { hint: '라이트 · 다크 · 시스템 중 마음에 드는 걸 골라 보세요', reset: () => mark(), done: () => tapped('settings-theme') },
  },
  {
    id: 'font-try',
    chapter: '설정',
    title: '글자 크기',
    body: '',
    target: { mobile: '[data-tour="settings-font"]', desktop: '[data-tour="settings-font"]' },
    scrollIntoView: true,
    action: { hint: '읽기 편한 글자 크기를 골라 보세요', reset: () => mark(), done: () => tapped('settings-font') },
  },
  {
    id: 'settings-play',
    chapter: '설정',
    title: '영상 재생 기본값',
    body: "'사이트 안에서 재생'이면 목록의 영상과 생방송 버튼은 펼쳐서, 쇼츠 버튼은 쇼츠 화면으로 열려요. 유튜브 앱이 편하면 '유튜브 링크로'를 고르세요.",
    target: { mobile: '[data-tour="settings-play"]', desktop: '[data-tour="settings-play"]' },
    scrollIntoView: true,
  },
  {
    id: 'preface-try',
    chapter: '설정',
    inNew: true,
    title: '일러두기',
    body: '',
    target: { mobile: '[data-settings-section="preface"]', desktop: '[data-settings-section="preface"]' },
    scrollIntoView: true,
    action: { hint: "'일러두기'를 눌러 열어 보세요", done: () => visible('#settings-section-preface .overflow-hidden') },
  },
  {
    id: 'preface-read',
    chapter: '설정',
    inNew: true,
    title: '일러두기는 꼭 읽어 주세요',
    body: '기록이 어떻게 만들어졌는지, 틀릴 수 있는 부분, 외부 링크 주의 같은 안내예요.',
    target: { mobile: '#settings-section-preface', desktop: '#settings-section-preface' },
    scrollIntoView: true,
    action: {
      hint: '끝까지 내려 읽어 주세요',
      reset: () => mark(),
      done: () => {
        const el = document.querySelector('#settings-section-preface');
        if (!el || Date.now() - snap.t0 < 4000) return false;
        return el.getBoundingClientRect().bottom <= fullHeight() - 40;
      },
    },
  },
  {
    id: 'settings-setup',
    chapter: '설정',
    title: '안내는 여기서 다시',
    body: '앱 설치 · 알림 · 캘린더 등록 안내는 언제든 여기서 다시 볼 수 있어요. 바로 아래에서 이 둘러보기도 다시 할 수 있어요.',
    target: { mobile: '[data-tour="settings-setup"]', desktop: '[data-tour="settings-setup"]' },
    scrollIntoView: true,
  },
  {
    id: 'done',
    inNew: true,
    title: '준비 끝!',
    body: '이제 편하게 둘러보세요. 방송 켜지는 날 같이 기다려요.',
    closeSettings: true,
  },
];

/** 이번 둘러보기 단계: 전체 / 새 기능만 (화면에 없어야 할 단계는 뺌) */
function buildSteps(mode: 'full' | 'new'): Step[] {
  const keep = (x: Step) => !x.onlyIf || x.onlyIf();
  if (mode === 'full') return STEPS.filter(keep);
  return [
    { id: 'welcome-new', title: `v${NEW_VERSION}에서 새로 생긴 것들`, body: '이미 둘러보셨으니 새 기능만 짧게 짚어 드릴게요.\n언제든 오른쪽 위 X로 닫을 수 있어요.' },
    ...STEPS.filter((x) => (x.isNew || x.inNew) && keep(x)),
  ];
}

const PAD = 8;
const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 1 };

type Rect = { x: number; y: number; w: number; h: number; r: number };

function findTarget(step: Step, isMobile: boolean): HTMLElement | null {
  const sel = isMobile ? step.target?.mobile : step.target?.desktop;
  if (!sel) return null;
  for (const one of sel.split(',').map((s) => s.trim())) {
    for (const el of document.querySelectorAll<HTMLElement>(one)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/** 다른 팝업(공지·약관·설정·로딩)이 떠 있으면 기다림 */
function isOtherOverlayOpen(root: HTMLElement | null) {
  const nodes = document.querySelectorAll<HTMLElement>('.fixed.inset-0, [role="dialog"]');
  for (const n of nodes) {
    if (root && root.contains(n)) continue;
    const st = getComputedStyle(n);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
    if (st.pointerEvents === 'none') continue;
    const r = n.getBoundingClientRect();
    if (r.width > window.innerWidth * 0.6 && r.height > window.innerHeight * 0.6) return true;
  }
  return false;
}

export function Tutorial({ enabled, activeTab, onTabChange, onCloseSettings, autoStart = true }: {
  enabled: boolean;
  onCloseSettings?: () => void;
  /** false 면 스스로 시작하지 않음 (처음 시작 화면이 끝날 때 시작시킴) */
  autoStart?: boolean;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState<Step[]>(STEPS);
  const stepsRef = useRef<Step[]>(STEPS);
  stepsRef.current = steps;
  const [mode, setMode] = useState<'full' | 'new'>('full');
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 390, h: typeof window !== 'undefined' ? fullHeight() : 844 });
  const rootRef = useRef<HTMLDivElement>(null);
  const originalTabRef = useRef<Tab>(activeTab);
  const demoTimers = useRef<number[]>([]);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const [actionDone, setActionDone] = useState(false);
  const [nudgeKey, setNudgeKey] = useState(0);
  // 처음 보는 둘러보기인지 (끝나면 '더 알아볼까요?' 를 이어서 보여 줌)
  const firstRunRef = useRef(false);
  // 강조 칸: 단계가 바뀔 때만 부드럽게 옮기고, 스크롤 등으로 따라갈 때는 바로 붙음
  const [settling, setSettling] = useState(true);
  runningRef.current = running;
  const isMobile = vp.w < 640;
  const step = steps[Math.min(index, steps.length - 1)];

  // ── 시작 조건: 처음 방문 + 관리자 허용 + 다른 팝업이 다 닫힌 뒤 ──
  useEffect(() => {
    if (!enabled) return;
    let done = false;
    let seenNew = false;
    try { done = localStorage.getItem(TUTORIAL_DONE_KEY) === '1'; seenNew = localStorage.getItem(TUTORIAL_NEW_KEY) === '1'; } catch {}
    if ((done && seenNew) || running) return;
    // 처음 오는 사람은 처음 시작 화면이 끝날 때 시작 (autoStart 꺼짐) · 예전에 둘러본 사람의 '새 기능'은 바로
    if (!autoStart && !done) return;
    // 예전 둘러보기를 본 사람은 새 기능만
    const m: 'full' | 'new' = done ? 'new' : 'full';
    let calm = 0;
    const id = window.setInterval(() => {
      calm = isOtherOverlayOpen(rootRef.current) ? 0 : calm + 1;
      if (calm >= 3) { // 약 0.9초 동안 팝업 없음
        window.clearInterval(id);
        if (runningRef.current) return;
        firstRunRef.current = m === 'full';
        originalTabRef.current = activeTab;
        setMode(m); setSteps(buildSteps(m));
        setIndex(0);
        setRunning(true);
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [enabled, autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // 설정의 '둘러보기 다시 보기'
  useEffect(() => {
    const start = () => {
      // 이미 진행 중이면 무시 (시작 신호가 두 번 오면 첫 단계로 되돌아가 '다음'이 안 먹는 것처럼 보였음)
      if (runningRef.current) return;
      try { firstRunRef.current = localStorage.getItem(TUTORIAL_DONE_KEY) !== '1'; } catch { firstRunRef.current = false; }
      originalTabRef.current = activeTab;
      setMode('full'); setSteps(buildSteps('full'));
      setIndex(0);
      setRunning(true);
    };
    window.addEventListener(TUTORIAL_START_EVENT, start);
    return () => window.removeEventListener(TUTORIAL_START_EVENT, start);
  }, [activeTab]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: fullHeight() });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clearDemo = useCallback(() => {
    demoTimers.current.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
    demoTimers.current = [];
  }, []);

  const finish = useCallback((completed = false) => {
    clearDemo();
    try { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); localStorage.setItem(TUTORIAL_NEW_KEY, '1'); } catch {}
    setRunning(false);
    setRect(null);
    onCloseSettings?.();
    onTabChange(originalTabRef.current === 'recommend' ? 'summary' : originalTabRef.current);
    // 처음 둘러보기를 끝까지 봤으면 '더 알아볼까요?' (아이폰은 앱 설치 안내부터)
    if (completed && firstRunRef.current) window.setTimeout(() => openSetupGuide(undefined, 'after-tour'), 450);
    firstRunRef.current = false;
  }, [clearDemo, onTabChange, onCloseSettings]);

  const next = useCallback(() => {
    clearDemo();
    setIndex((i) => {
      if (i >= stepsRef.current.length - 1) { window.setTimeout(() => finish(true), 0); return i; }
      return i + 1;
    });
  }, [clearDemo, finish]);

  const prev = useCallback(() => {
    clearDemo();
    setIndex((i) => Math.max(0, i - 1));
  }, [clearDemo]);

  // ── 단계 진입: 탭 이동 → 대상 찾기 → 화면 안으로 스크롤 → 시연 ──
  useEffect(() => {
    if (!running) return;
    setRect(null);
    setActionDone(false);
    setSettling(true);
    const settle = window.setTimeout(() => setSettling(false), 650);
    demoTimers.current.push(settle as unknown as number);
    if (step.closeSettings) onCloseSettings?.();
    if (step.tab) onTabChange(step.tab);
    step.action?.reset?.();
    if (!step.target) return;
    let cancelled = false;
    let tries = 0;
    const locate = () => {
      if (cancelled) return;
      const el = findTarget(step, isMobile);
      if (!el) {
        if (++tries < 25) { window.setTimeout(locate, 80); return; }
        next(); // 이 화면에 없는 요소(예: 방송 중이라 다른 카드)면 건너뜀
        return;
      }
      const isFixed = (() => { let n: HTMLElement | null = el; while (n) { if (getComputedStyle(n).position === 'fixed') return true; n = n.parentElement; } return false; })();
      // 대상이 화면 밖에 있으면 보이는 곳으로 (탭 전환 뒤 스크롤 복원이 늦게 와도 다시 맞춤)
      if (step.scrollIntoView) {
        // 설정 패널 안쪽처럼 따로 스크롤되는 상자: 그 상자 안에서 가운데로
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const again = window.setTimeout(() => { if (!cancelled) (findTarget(step, isMobile) || el).scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 500);
        demoTimers.current.push(again as unknown as number);
        return;
      }
      const ensureVisible = () => {
        if (cancelled || isFixed) return;
        const cur = findTarget(step, isMobile) || el;
        if (step.scrollTop) {
          if (window.scrollY > 4) window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const r = cur.getBoundingClientRect();
        const topSafe = 90;
        const bottomSafe = fullHeight() - (isMobile ? 120 : 40);
        const fits = r.height <= bottomSafe - topSafe;
        const needs = fits ? (r.top < topSafe - 2 || r.bottom > bottomSafe + 2) : Math.abs(r.top - topSafe) > 24;
        if (needs) {
          const offset = fits ? Math.max(topSafe, (fullHeight() - r.height) / 2 - 40) : topSafe;
          window.scrollTo({ top: Math.max(0, window.scrollY + r.top - offset), behavior: 'smooth' });
        }
      };
      if (step.scrollTop && isFixed) window.scrollTo({ top: 0, behavior: 'smooth' });
      ensureVisible();
      const iv = window.setInterval(ensureVisible, 700);
      demoTimers.current.push(iv as unknown as number);
    };
    const t = window.setTimeout(locate, 120);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [running, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 직접 해 보는 단계: 조건이 맞으면 잠깐 칭찬 후 다음 설명으로 ──
  useEffect(() => {
    if (!running || !step.action) return;
    let fired = false;
    const id = window.setInterval(() => {
      if (fired) return;
      if (step.action!.done({ activeTab: activeTabRef.current })) {
        fired = true;
        setActionDone(true);
        window.setTimeout(() => setIndex((i) => (stepsRef.current[i]?.id === step.id ? Math.min(i + 1, stepsRef.current.length - 1) : i)), 650);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [running, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 대상 위치를 매 프레임 따라감 (스크롤·펼침·화면 회전에도 정확히) ──
  useLayoutEffect(() => {
    if (!running || !step.target) return;
    let raf = 0;
    const tick = () => {
      const el = findTarget(step, isMobile);
      if (el) {
        const r = el.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
        const nx = Math.round(r.left - PAD), ny = Math.round(r.top - PAD);
        const nw = Math.round(r.width + PAD * 2), nh = Math.round(r.height + PAD * 2);
        setRect((prev) => (prev && prev.x === nx && prev.y === ny && prev.w === nw && prev.h === nh ? prev : { x: nx, y: ny, w: nw, h: nh, r: Math.min(radius + PAD, nh / 2) }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, index, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // 키보드: → / Enter 다음, ← 이전, Esc 건너뛰기
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, next, prev, finish]);

  useEffect(() => () => clearDemo(), [clearDemo]);

  // ── 말풍선 위치: 대상 아래 공간이 넉넉하면 아래, 아니면 위 ──
  const bubble = useMemo(() => {
    const w = Math.min(340, vp.w - 32);
    const NEED = 230; // 말풍선이 들어갈 최소 높이
    if (!rect) return { left: (vp.w - w) / 2, top: vp.h / 2, w, center: true, below: true, dock: false };
    const spaceBelow = vp.h - (rect.y + rect.h);
    const left = Math.min(Math.max(16, rect.x + rect.w / 2 - w / 2), vp.w - w - 16);
    const dockTop = vp.h - (vp.w < 640 ? 104 : 24);
    // 대상이 아직 화면 밖(스크롤 중 등)이면 말풍선은 화면 아래에 붙여 둠 → 말풍선이 화면 밖으로 사라져 막히는 일 없게
    if (rect.y > vp.h - 40 || rect.y + rect.h < 40) return { left: (vp.w - w) / 2, top: dockTop, w, center: false, below: false, dock: true };
    if (spaceBelow >= NEED) return { left, top: rect.y + rect.h + 14, w, center: false, below: true, dock: false };
    if (rect.y >= NEED) return { left, top: Math.min(rect.y - 14, dockTop), w, center: false, below: false, dock: false };
    // 대상이 화면을 거의 다 차지하면 화면 아래쪽(모바일은 탭바 위)에 붙여 보여줌
    return { left: (vp.w - w) / 2, top: vp.h - (vp.w < 640 ? 104 : 24), w, center: false, below: false, dock: true };
  }, [rect, vp]);

  if (!running) return null;
  const centered = !step.target;
  const total = steps.length;

  const isAction = Boolean(step.action);
  const nudge = () => {
    setNudgeKey((k) => k + 1);
  };
  // 직접 해 보는 단계: 강조된 구멍 밖만 막고(누르면 말풍선이 살짝 흔들림), 구멍 안은 실제 화면을 누를 수 있음
  const blockers = isAction && rect
    ? [
        { left: 0, top: 0, width: vp.w, height: Math.max(0, rect.y) },
        { left: 0, top: rect.y + rect.h, width: vp.w, height: Math.max(0, vp.h - rect.y - rect.h) },
        { left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.h },
        { left: rect.x + rect.w, top: rect.y, width: Math.max(0, vp.w - rect.x - rect.w), height: rect.h },
      ]
    : null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[400] select-none pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="사이트 둘러보기"
    >
      {blockers ? (
        blockers.map((b, i) => (
          <div key={i} className="absolute pointer-events-auto" style={{ ...b, touchAction: 'none' }} onClick={nudge} />
        ))
      ) : (
        <div className="absolute inset-0 pointer-events-auto" style={{ touchAction: 'none' }} onClick={next} />
      )}
      {/* 어둡게 덮고 대상 부분만 뚫기 */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" width={vp.w} height={vp.h} aria-hidden="true">
        <defs>
          <mask id="tutorial-hole">
            <rect x="0" y="0" width={vp.w} height={vp.h} fill="white" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h, rx: rect.r }}
                transition={settling ? SPRING : { duration: 0 }}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <motion.rect
          x="0" y="0" width={vp.w} height={vp.h}
          fill="rgba(0,0,0,0.62)"
          mask="url(#tutorial-hole)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      </svg>

      {/* 강조 테두리 + 숨 쉬는 빛 */}
      {rect && (
        <motion.div
          className="absolute pointer-events-none"
          initial={false}
          animate={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.r }}
          transition={settling ? SPRING : { duration: 0 }}
        >
          <div className="absolute inset-0 rounded-[inherit] ring-2 ring-white/90 shadow-[0_0_0_4px_rgba(168,85,247,0.45)]" />
          <motion.div
            className="absolute inset-0 rounded-[inherit] ring-2 ring-purple-400"
            animate={{ opacity: [0.7, 0, 0.7], scale: [1, 1.06, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      )}

      {/* 말풍선 (바깥 상자가 자리를 잡고, 안쪽만 스프링으로 등장) */}
      <div
        className="absolute pointer-events-auto"
        style={centered
          ? { left: bubble.left, top: '50%', width: bubble.w, transform: 'translateY(-50%)' }
          : { left: bubble.left, top: bubble.top, width: bubble.w, transform: bubble.below ? undefined : 'translateY(-100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: bubble.below ? 8 : -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
          transition={SPRING}
        >
          <motion.div key={`nudge-${nudgeKey}`} initial={{ x: 0 }} animate={nudgeKey > 0 ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
          <div className="rounded-[22px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/10 p-5">
            {centered && (
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
                <Compass className="w-6 h-6" />
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[length:calc(11px*var(--fs,1))] font-bold text-purple-600 dark:text-purple-400 tabular-nums">
                {step.chapter && <span className="px-1.5 py-px rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">{step.chapter}</span>}
                {(step.isNew || step.id === 'welcome-new') && <span className="px-1.5 py-px rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">새 기능</span>}
              </p>
              <button type="button" onClick={() => finish(false)} className="-mt-2 -mr-2 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer" aria-label="둘러보기 닫기">
                <X className="w-4 h-4" />
              </button>
            </div>
            <h3 className="mt-0.5 text-base sm:text-lg font-extrabold leading-snug break-keep">{step.title}</h3>
            {step.body && <p className="mt-1.5 text-[length:calc(13px*var(--fs,1))] sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line break-keep">{step.body}</p>}
            {step.extra && (
              <button type="button" onClick={step.extra.onClick} className="mt-3 w-full h-10 rounded-xl bg-purple-600/10 dark:bg-purple-400/15 text-purple-700 dark:text-purple-200 text-[length:calc(13px*var(--fs,1))] font-bold cursor-pointer active:scale-[0.98] transition">
                {step.extra.label}
              </button>
            )}
            {step.action && (
              <div className={`mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[length:calc(13px*var(--fs,1))] font-bold transition-colors ${actionDone ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'}`}>
                {actionDone ? <Check className="w-4 h-4 shrink-0" /> : <Pointer className="w-4 h-4 shrink-0 animate-bounce" />}
                <span className="break-keep">{actionDone ? '잘했어요!' : step.action.hint}</span>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <span />
              <div className="flex items-center gap-2">
                {index > 0 && index < total - 1 && (
                  <button type="button" onClick={prev} className="px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer">
                    이전
                  </button>
                )}
                <button type="button" onClick={index < total - 1 ? next : () => finish(true)} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${isAction ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>
                  {index === 0 ? (mode === 'new' ? '새 기능 보기' : '둘러보기 시작') : isAction ? '넘어가기' : index < total - 1 ? '다음' : '시작하기'}
                </button>
              </div>
            </div>
          </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
      </div>
    </div>
  );
}
