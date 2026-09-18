import * as htmlToImage from 'html-to-image';

/**
 * Toast helper for showing brief notification
 */
function showSimpleToast(message: string) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('simple-share-toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'simple-share-toast';
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '90px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.backgroundColor = 'rgba(24, 24, 27, 0.92)';
  toast.style.color = '#ffffff';
  toast.style.padding = '10px 18px';
  toast.style.borderRadius = '9999px';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '600';
  toast.style.zIndex = '9999';
  toast.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.25)';
  toast.style.pointerEvents = 'none';
  toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  toast.style.opacity = '0';

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(-4px)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

/**
 * Capture an HTMLElement as an image blob and trigger native OS share or fallback download.
 * 상세 분석 탭의 PDF와 동일한 원리: 
 * 화면의 다크모드/라이트모드(html.dark)를 조작하여 색을 변화시키지 않고,
 * 화면 밖(left: -9999px) 오프스크린 클론 컨테이너를 생성하여 고해상도 라이트 모드 이미지를 추출합니다.
 */
export async function shareElementAsImage(
  target: HTMLElement | string,
  title: string = '우주하마 통계',
  showToast?: (msg: string) => void
): Promise<boolean> {
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) {
    console.error('Target element not found for sharing:', target);
    return false;
  }

  let offscreenContainer: HTMLDivElement | null = null;

  try {
    const rect = element.getBoundingClientRect();
    const sourceWidth = Math.max(Math.round(rect.width), 360);

    // 1. 오프스크린 컨테이너 생성 (사용자 화면에 색상 변화나 번쩍임이 전혀 없음)
    offscreenContainer = document.createElement('div');
    offscreenContainer.setAttribute('data-offscreen-share', 'true');
    offscreenContainer.style.position = 'fixed';
    offscreenContainer.style.left = '-9999px';
    offscreenContainer.style.top = '0';
    offscreenContainer.style.zIndex = '-9999';
    offscreenContainer.style.pointerEvents = 'none';
    offscreenContainer.style.backgroundColor = '#ffffff';
    offscreenContainer.style.color = '#18181b';

    // 2. 대상 요소를 딥 클론하여 오프스크린 래퍼에 마운트
    const cloned = element.cloneNode(true) as HTMLElement;
    cloned.classList.add('capturing-image');
    cloned.setAttribute('data-capturing', 'true');
    cloned.style.width = `${sourceWidth}px`;
    cloned.style.maxWidth = `${sourceWidth}px`;
    cloned.style.backgroundColor = '#ffffff';
    cloned.style.color = '#18181b';
    cloned.style.boxSizing = 'border-box';

    // 라이트 모드 캡처 시 dark: 클래스로 인해 배경이 까맣게 출력되는 현상 완전 방지:
    // 복제본의 모든 요소에서 'dark:' 접두사 클래스를 제거하여 라이트 모드 기본 스타일이 온전히 적용되도록 함
    const allClonedNodes = [cloned, ...Array.from(cloned.querySelectorAll('*'))];
    allClonedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        const toRemove: string[] = [];
        node.classList.forEach((cls) => {
          if (cls.startsWith('dark:')) {
            toRemove.push(cls);
          }
        });
        toRemove.forEach((cls) => node.classList.remove(cls));

        // 어두운 배경색이 인라인이나 기본 클래스로 지정된 카드 칸(예: bg-zinc-950)을 밝은 톤(#f8fafc)으로 보정
        if (node.classList.contains('bg-zinc-950') || node.classList.contains('bg-black')) {
          node.classList.remove('bg-zinc-950', 'bg-black');
          node.classList.add('bg-zinc-50');
        }
      }
    });

    // 3. 캡처 결과물에서 공유 버튼 제거
    cloned.querySelectorAll('[data-no-share="true"], .no-share').forEach((el) => el.remove());

    // 3-1. 설정 확인: 공유 시 그래프 데이터 수치(라벨) 표시 여부 (기본값: true)
    const showDataLabels = (() => {
      if (typeof window === 'undefined') return true;
      const val = localStorage.getItem('uzuhama_setting_share_data_labels');
      return val === null ? true : val === 'true';
    })();

    if (!showDataLabels) {
      cloned.querySelectorAll('.chart-capture-only-label, [class*="chart-capture-only-label"], .smart-trend-label, text.chart-capture-only-label, g.chart-capture-only-label').forEach((el) => el.remove());
    }

    // 3-2. 그래프에 마우스/터치로 활성화된 툴팁 및 커서 제거 (공유 시 툴팁 숨김)
    cloned.querySelectorAll('.recharts-tooltip-wrapper, .recharts-default-tooltip, [class*="recharts-tooltip"], .recharts-tooltip-cursor, .recharts-active-dot').forEach((el) => el.remove());

    // 4. 원본 SVG 요소들의 width/height를 클론에도 명시적으로 적용
    const origSvgs = element.querySelectorAll('svg');
    const cloneSvgs = cloned.querySelectorAll('svg');
    origSvgs.forEach((origSvg, idx) => {
      const cSvg = cloneSvgs[idx];
      if (cSvg) {
        const svgRect = origSvg.getBoundingClientRect();
        if (svgRect.width > 0) cSvg.setAttribute('width', `${Math.round(svgRect.width)}`);
        if (svgRect.height > 0) cSvg.setAttribute('height', `${Math.round(svgRect.height)}`);
      }
    });

    // 5. 캔버스가 존재할 경우 비트맵 픽셀 복사
    const origCanvases = element.querySelectorAll('canvas');
    const cloneCanvases = cloned.querySelectorAll('canvas');
    origCanvases.forEach((origCanvas, idx) => {
      const cCanvas = cloneCanvases[idx];
      if (cCanvas) {
        cCanvas.width = origCanvas.width;
        cCanvas.height = origCanvas.height;
        const ctx = cCanvas.getContext('2d');
        if (ctx) ctx.drawImage(origCanvas, 0, 0);
      }
    });

    offscreenContainer.appendChild(cloned);
    document.body.appendChild(offscreenContainer);

    // 6. 오프스크린 노드 레이아웃 및 폰트 렌더링 완료 대기 (화면 깜빡임 없음)
    await new Promise((resolve) => setTimeout(resolve, 70));

    // 7. Convert offscreen element to high-res PNG blob in forced light mode (PDF-like clarity)
    const blob = await htmlToImage.toBlob(cloned, {
      pixelRatio: 3.0, // 3배 고해상도로 모바일/데스크톱 모두에서 텍스트와 숫자가 번짐 없이 또렷하게 렌더링
      quality: 1.0,
      backgroundColor: '#ffffff',
      style: {
        backgroundColor: '#ffffff',
        color: '#18181b',
        textRendering: 'geometricPrecision',
      },
    });

    if (!blob) {
      throw new Error('Image generation returned empty blob');
    }

    const cleanTitle = title.replace(/[^\w\sㄱ-힣-]/g, '').trim() || '통계';
    const fileName = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    // Try device native file share (iOS Safari, Android Chrome, etc.)
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `우주하마 - ${title}`,
          text: `우주하마 통계: ${title}`,
          files: [file],
        });
        return true;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return true; // User cancelled share sheet
        }
      }
    }

    // Fallback: download file
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (showToast) {
      showToast('이미지가 저장되었습니다.');
    } else {
      showSimpleToast('이미지가 저장되었습니다.');
    }
    return true;
  } catch (error) {
    console.error('Failed to share element as image:', error);
    if (showToast) {
      showToast('이미지 캡처 중 오류가 발생했습니다.');
    } else {
      showSimpleToast('이미지 캡처 중 오류가 발생했습니다.');
    }
    return false;
  } finally {
    // 8. 오프스크린 가상 DOM 노드 완전히 제거
    if (offscreenContainer && offscreenContainer.parentNode) {
      offscreenContainer.parentNode.removeChild(offscreenContainer);
    }
  }
}

/**
 * Format video and broadcast info for text sharing as requested:
 * 생방일: YYYY.MM.DD
 * 게임: (게임이름, 링크)
 * 생방송: (링크)
 * 영상: (영상이름, 링크)
 * 쇼츠: (영상이름, 링크)
 * 
 * [규칙]
 * 1. 빈칸인 정보가 있으면 그 필드는 출력에서 완전히 제거 (예: 쇼츠가 없으면 "쇼츠:" 필드 생략)
 * 2. 복수 항목일 경우 "1. ", "2. " 번호 목록 형태로 표시
 * 3. 몰아보기 공유 시 연동된 모든 게임 링크 및 몰아보기 본체와 해당 영상에 들어간 개별 편집본 링크들까지 모두 표시
 */
export function formatRecommendShareText(video: any, allLogs?: Record<string, any> | any[]): string {
  const log = video.parentLog;
  const isCompilation = !!(video.isCompilation || video.compilationId);
  const logsList = allLogs ? (Array.isArray(allLogs) ? allLogs : Object.values(allLogs || {})) : [];

  // 1. 생방일 목록 수집: 몰아보기의 경우 사용자가 지정한 게임 순서에 대응하는 방송일 순서 우선
  let dates: string[] = [];
  if (isCompilation && Array.isArray(video.games) && video.games.length > 0) {
    const datesFromGames: string[] = [];
    video.games.forEach((g: any) => {
      let d = g.date;
      if (!d && logsList.length > 0) {
        const matched = logsList.find((l: any) => 
          (Array.isArray(l.games) && l.games.some((x: any) => x.name === g.name)) || l.game === g.name
        );
        if (matched?.date) d = matched.date;
      }
      if (d && !datesFromGames.includes(d)) {
        datesFromGames.push(d);
      }
    });

    if (Array.isArray(video.allBroadcastDates)) {
      video.allBroadcastDates.forEach((d: string) => {
        if (d && !datesFromGames.includes(d)) {
          datesFromGames.push(d);
        }
      });
    }

    dates = datesFromGames;
  }

  if (dates.length === 0) {
    dates = (video.allBroadcastDates && Array.isArray(video.allBroadcastDates) && video.allBroadcastDates.length > 0)
      ? Array.from(new Set(video.allBroadcastDates.filter(Boolean) as string[])).sort((a: string, b: string) => b.localeCompare(a))
      : (log?.date ? [log.date] : []);
  }

  // 만약 dates가 비어있고 parentLog도 없는 경우 기본값 처리
  if (dates.length === 0) {
    const lines: string[] = [];
    if (video.videoTitle || video.videoUrl) {
      lines.push(`• 영상: ${video.videoTitle && video.videoUrl ? `${video.videoTitle}, ${video.videoUrl}` : (video.videoUrl || video.videoTitle)}`);
    }
    return lines.join('\n');
  }

  // 2. 한 생방씩 블록 생성
  // 구분점으로:
  // • 생방일
  // • 생방 링크
  // • 게임: 게임 이름, 링크
  // • 영상: 영상 제목, 링크
  // (• 쇼츠: 쇼츠 제목, 링크 - 해당 생방에 있을 경우만)
  const broadcastBlocks: string[] = [];

  dates.forEach((d: string) => {
    const formattedDate = d.replace(/-/g, '.');
    const matchedLog = logsList.find((l: any) => l.date === d) || (log?.date === d ? log : null);
    const blockLines: string[] = [];

    // (1) • 생방일
    blockLines.push(`• ${formattedDate}`);

    // (2) • 영상: 개별 영상만 수집 (몰아보기 본체 및 몰아보기 영상은 완전 제외)
    const dayVideos: Array<{ title: string; url: string }> = [];
    const seenVideoUrls = new Set<string>();

    const addDayVideo = (title: string, url: string) => {
      const cleanUrl = url?.trim();
      if (!cleanUrl || seenVideoUrls.has(cleanUrl)) return;
      const lowerTitle = (title || '').toLowerCase();
      // 몰아보기 영상 제외
      if (lowerTitle.includes('몰아보기')) return;
      if (isCompilation && cleanUrl === video.videoUrl) return;

      seenVideoUrls.add(cleanUrl);
      dayVideos.push({ title: title?.trim() || '', url: cleanUrl });
    };

    if (isCompilation) {
      // 해당 날짜 로그의 개별 편집본 수집 (몰아보기 제외)
      if (Array.isArray(matchedLog?.edited)) {
        matchedLog.edited.forEach((edit: any) => {
          if (!edit.isCompilation && !edit.compilationId && !edit.title?.includes('몰아보기') && edit.url !== video.videoUrl) {
            addDayVideo(edit.title || '우주하마 개별 영상', edit.url);
          }
        });
      }
    } else {
      // 일반 영상: 메인 영상이 몰아보기가 아닐 때만 포함
      if (video.videoUrl && !video.videoTitle?.includes('몰아보기')) {
        addDayVideo(video.videoTitle || '', video.videoUrl);
      }
      // 해당 로그의 기타 개별 편집본 (몰아보기 제외)
      if (Array.isArray(matchedLog?.edited)) {
        matchedLog.edited.forEach((edit: any) => {
          if (!edit.isCompilation && !edit.compilationId && !edit.title?.includes('몰아보기') && edit.url && edit.url !== video.videoUrl) {
            addDayVideo(edit.title || '우주하마 개별 영상', edit.url);
          }
        });
      }
    }

    dayVideos.forEach((v) => {
      if (v.title && v.url) {
        blockLines.push(`• 영상: ${v.title}, ${v.url}`);
      } else {
        blockLines.push(`• 영상: ${v.url || v.title}`);
      }
    });

    // (3) • 게임: 게임 이름, 링크
    const dayGames: Array<{ name: string; link?: string }> = [];
    const seenDayGames = new Set<string>();

    const addDayGame = (g: any) => {
      if (!g) return;
      const name = (typeof g === 'string' ? g : g.name)?.trim();
      const link = (typeof g === 'string' ? '' : g.link)?.trim() || '';
      if (name) {
        const key = `${name.toLowerCase()}_${link}`;
        if (!seenDayGames.has(key)) {
          seenDayGames.add(key);
          dayGames.push({ name, link });
        }
      }
    };

    // 몰아보기 video.games 중 해당 날짜에 매칭되는 게임 확인
    if (isCompilation && Array.isArray(video.games)) {
      video.games.forEach((g: any) => {
        if (g.date === d) {
          addDayGame(g);
        }
      });
    }
    // matchedLog의 게임들 확인
    if (Array.isArray(matchedLog?.games)) {
      matchedLog.games.forEach((g: any) => {
        // video.games에 link가 있으면 그 link 우선 적용
        let link = g.link;
        if (isCompilation && Array.isArray(video.games)) {
          const vg = video.games.find((x: any) => x.name === g.name);
          if (vg?.link) link = vg.link;
        }
        addDayGame({ ...g, link });
      });
    } else if (matchedLog?.game) {
      addDayGame({ name: matchedLog.game, link: '' });
    }

    dayGames.forEach((g) => {
      if (g.link) {
        blockLines.push(`• 게임: ${g.name}, ${g.link}`);
      } else {
        blockLines.push(`• 게임: ${g.name}`);
      }
    });

    // (4) • 생방 링크
    const dayVods: string[] = [];
    if (Array.isArray(matchedLog?.vods)) {
      matchedLog.vods.forEach((v: any) => {
        const u = (typeof v === 'string' ? v : v?.url)?.trim();
        if (u && !dayVods.includes(u)) {
          dayVods.push(u);
        }
      });
    }
    if (matchedLog?.vodUrl) {
      const u = matchedLog.vodUrl.trim();
      if (u && !dayVods.includes(u)) {
        dayVods.push(u);
      }
    }

    dayVods.forEach((vodUrl) => {
      blockLines.push(`• 생방: ${vodUrl}`);
    });

    // (5) • 쇼츠: 쇼츠 제목, 링크 (해당 생방에 있을 경우만)
    const dayShorts: Array<{ title: string; url: string }> = [];
    const seenShortsUrls = new Set<string>();

    if (Array.isArray(matchedLog?.shorts)) {
      matchedLog.shorts.forEach((s: any) => {
        const url = (typeof s === 'string' ? s : s?.url)?.trim();
        if (url && !seenShortsUrls.has(url)) {
          seenShortsUrls.add(url);
          const title = typeof s === 'string' ? '' : (s?.title?.trim() || '');
          dayShorts.push({ title, url });
        }
      });
    }

    dayShorts.forEach((s) => {
      if (s.title && s.url) {
        blockLines.push(`• 쇼츠: ${s.title}, ${s.url}`);
      } else {
        blockLines.push(`• 쇼츠: ${s.url || s.title}`);
      }
    });

    broadcastBlocks.push(blockLines.join('\n'));
  });

  return broadcastBlocks.join('\n\n');
}

/**
 * Trigger native text share or fallback to clipboard copy
 * [중요] 첫 번째 인자를 복사/공유할 본문 text로 보장하여
 * 모바일 공유 및 클립보드 복사 시 본문 전체가 온전히 들어가도록 함.
 */
export async function shareTextOrClipboard(
  text: string,
  title: string = '우주하마 정보',
  showToast?: (msg: string) => void
): Promise<boolean> {
  // 1. 모바일 기기 네이티브 텍스트 공유 시도
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text,
      });
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return true; // 사용자가 공유창을 닫음
      }
      // 실패 시 클립보드 복사로 연속 진행
    }
  }

  // 2. Clipboard API 복사
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      if (showToast) {
        showToast('클립보드에 복사되었습니다.');
      } else {
        showSimpleToast('클립보드에 복사되었습니다.');
      }
      return true;
    }
  } catch (clipErr) {
    console.warn('Clipboard write failed:', clipErr);
  }

  // 3. 구형 브라우저 Fallback
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    if (showToast) {
      showToast('클립보드에 복사되었습니다.');
    } else {
      showSimpleToast('클립보드에 복사되었습니다.');
    }
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
