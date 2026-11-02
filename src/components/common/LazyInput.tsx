import React, { forwardRef, memo, startTransition, useEffect, useRef, useState } from 'react';

/**
 * 타이핑이 밀리지 않는 검색창 입력
 * - 글자는 이 입력창 안에서만 바로 바뀜 (화면 전체를 다시 그리지 않음)
 * - 입력이 잠깐 멈추면(기본 220ms) 그때 검색어를 위로 넘김, 그것도 급하지 않은 작업으로
 * - 입력창 값은 이 안에서만 관리해서, 위쪽 화면이 다시 그려져도 한글 조합이 끊기거나 밀리지 않음
 * - 바깥에서 검색어가 바뀌면(지우기, 태그 눌러 검색 등) 그 값으로 맞춤
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'defaultValue'> & {
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
};

export const LazyInput = memo(forwardRef<HTMLInputElement, Props>(function LazyInput(
  { value, onCommit, delay = 220, onKeyDown, onBlur, onCompositionStart, onCompositionEnd, ...rest },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const sent = useRef(value);
  const recent = useRef<string[]>([]); // 최근에 넘긴 값들 (늦게 돌아와도 입력창을 되돌리지 않게)
  const pending = useRef<string | null>(null);
  const composing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const flush = () => {
    window.clearTimeout(timer.current);
    const v = pending.current;
    if (v === null) return;
    pending.current = null;
    if (v === sent.current) return;
    sent.current = v;
    recent.current = [...recent.current.slice(-4), v];
    startTransition(() => commitRef.current(v));
  };
  const schedule = (v: string) => {
    pending.current = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  };

  // 바깥에서 바뀐 값 반영 (내가 넘긴 값이 돌아온 경우는 무시)
  useEffect(() => {
    if (value === sent.current) { recent.current = []; return; } // 따라잡음
    if (recent.current.includes(value) && value !== draftRef.current) return; // 예전 값이 늦게 돌아옴
    sent.current = value;
    recent.current = [];
    pending.current = null;
    window.clearTimeout(timer.current);
    setDraft(value);
  }, [value]);

  // 사라질 때 남은 입력은 넘겨 둠
  useEffect(() => () => { window.clearTimeout(timer.current); const v = pending.current; if (v !== null && v !== sent.current) commitRef.current(v); }, []);

  return (
    <input
      {...rest}
      ref={ref}
      value={draft}
      onChange={(e) => { setDraft(e.target.value); schedule(e.target.value); }}
      onCompositionStart={(e) => { composing.current = true; onCompositionStart?.(e); }}
      onCompositionEnd={(e) => {
        composing.current = false;
        const v = e.currentTarget.value;
        setDraft(v);
        schedule(v);
        onCompositionEnd?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) { pending.current = e.currentTarget.value; flush(); }
        onKeyDown?.(e);
      }}
      onBlur={(e) => { composing.current = false; if (pending.current !== null) flush(); onBlur?.(e); }}
    />
  );
}));
