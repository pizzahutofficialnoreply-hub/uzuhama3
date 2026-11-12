/**
 * 공통 알림
 *  toast('저장했어요')                    안내만 (화면 아래 잠깐)
 *  await confirmSheet('지울까요?')         고르기가 필요한 확인 (밑에서 올라오는 창) → true/false
 *  await confirmSheet({ title, message, confirmText: '삭제', danger: true })
 */
import { TOAST_EVENT } from '../components/common/ItemMenu';

export const CONFIRM_EVENT = 'uzuhama-confirm';
export type ConfirmOpts = { title?: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean };

export const toast = (text: string, kind?: 'info' | 'success' | 'error') =>
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: kind ? { text, kind } : text }));

const DANGER = /삭제|지울|지워|초기화|비울|되돌릴 수 없|영구|탈퇴|해제할까|끊을까|로그아웃/;

export function confirmSheet(o: string | ConfirmOpts): Promise<boolean> {
  const opts: ConfirmOpts = typeof o === 'string' ? splitMessage(o) : o;
  if (opts.danger === undefined) opts.danger = DANGER.test(`${opts.title || ''} ${opts.message || ''}`);
  if (!opts.confirmText) opts.confirmText = /삭제|지울|지워/.test(`${opts.title || ''}${opts.message || ''}`) ? '삭제' : '확인';
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: { ...opts, resolve } }));
  });
}

/** '첫 줄\n\n나머지' → 제목 + 설명 */
function splitMessage(s: string): ConfirmOpts {
  const parts = String(s || '').split(/\n\s*\n/);
  if (parts.length > 1 && parts[0].length <= 40) return { title: parts[0].trim(), message: parts.slice(1).join('\n\n').trim() };
  const first = s.split('\n');
  if (first.length > 1 && first[0].length <= 40) return { title: first[0].trim(), message: first.slice(1).join('\n').trim() };
  return s.length <= 40 ? { title: s } : { message: s };
}

/**
 * 입력이 틀렸을 때: 창 대신 그 칸 바로 아래에 빨간 글씨 (고치기 시작하면 사라짐)
 *  fieldError('fb-title', '제목을 입력해 주세요')   (id 또는 요소)
 *  칸을 못 찾으면 토스트로
 */
export function fieldError(target: string | HTMLElement | null | undefined, msg: string) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) { toast(msg, 'error'); return; }
  const anchor = (el.closest('[data-field]') as HTMLElement) || el;
  anchor.parentElement?.querySelectorAll(`[data-field-error-for="${el.id || 'x'}"]`).forEach((n) => n.remove());
  const p = document.createElement('p');
  p.setAttribute('role', 'alert');
  p.dataset.fieldErrorFor = el.id || 'x';
  p.className = 'field-error mt-1.5 text-xs font-semibold text-red-500 flex items-center gap-1';
  p.textContent = msg;
  anchor.insertAdjacentElement('afterend', p);
  el.setAttribute('aria-invalid', 'true');
  el.classList.add('field-invalid');
  try { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* */ }
  const clear = () => { p.remove(); el.removeAttribute('aria-invalid'); el.classList.remove('field-invalid'); };
  el.addEventListener('input', clear, { once: true });
  el.addEventListener('change', clear, { once: true });
}

/** 여러 개 중 고르기 (밑에서 올라오는 창) → 고른 value, 취소면 null
 *  await chooseSheet({ title: '이 영상', options: [{ value: 'hide', label: '이 영상 가리기', desc: '…' }, …] }) */
export const CHOOSE_EVENT = 'uzuhama-choose';
export type ChooseOption = { value: string; label: string; desc?: string; icon?: 'hide' | 'flag' | 'trash' | 'share' | 'save'; danger?: boolean };
export function chooseSheet(o: { title?: string; message?: string; options: ChooseOption[] }): Promise<string | null> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(CHOOSE_EVENT, { detail: { ...o, resolve } }));
  });
}
