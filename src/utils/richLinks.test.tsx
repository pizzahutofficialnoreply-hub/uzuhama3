import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RichTextRenderer } from '../components/common/RichTextRenderer';

describe('공지 글 링크', () => {
  it('글자에 거는 링크 · 사이트 안 링크 · 주소 속 밑줄', () => {
    const h = renderToStaticMarkup(<RichTextRenderer content={'✓ [의견 보내기로 이동하기](app://의견)\n[스팀](https://store.steampowered.com/app/1/Librarian_Tidy_Up/) 그리고 _기울임_'} />);
    expect(h).toContain('href="app://의견" data-app-link="1"');
    expect(h).toContain('href="https://store.steampowered.com/app/1/Librarian_Tidy_Up/"');
    expect(h).toContain('<em class="italic">기울임</em>');
  });
});
