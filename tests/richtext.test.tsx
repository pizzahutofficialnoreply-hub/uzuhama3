import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RichTextRenderer, plainText } from '../src/components/common/RichTextRenderer';

const html = (c: string) => renderToStaticMarkup(<RichTextRenderer content={c} />);

describe('공지 서식', () => {
  it('편집기 글자 색은 색으로, 태그 글자는 안 보임', () => {
    const out = html('오늘 <span style="color: #ef4444">휴방</span>이에요 **꼭** 확인');
    expect(out).toContain('style="color: #ef4444"');
    expect(out).not.toContain('&lt;span');
    expect(out).toContain('<strong');
  });
  it('위험한 속성은 버림', () => {
    const out = html('<span style="background-image: url(x); color: red">a</span><script>alert(1)</script>');
    expect(out).not.toContain('url(');
    expect(out).not.toContain('<script');
  });
  it('여러 줄 가운데 정렬 블록', () => {
    const out = html('<div align="center">\n가운데\n</div>\n보통');
    expect(out).toContain('text-center');
    expect(out).not.toContain('&lt;div');
  });
  it('한 줄 미리보기는 글자만', () => {
    expect(plainText('[공지] <span style="color: red">**휴방**</span> 안내')).toBe('[공지] 휴방 안내');
  });
});
