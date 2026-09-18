import { Poll } from '../types';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

/**
 * 투표 결과를 요약한 고해상도 이미지(Blob)를 HTML5 Canvas로 생성합니다.
 */
export async function generatePollResultImage(poll: Poll, totalVotes: number): Promise<Blob> {
  // 텍스트 줄바꿈 헬퍼
  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): number => {
    const words = text.split('');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY + lineHeight;
  };

  const width = 800;
  // 옵션 개수에 따라 높이 자동 계산 (최소 600)
  const optionHeight = 76;
  const headerHeight = 270;
  const footerHeight = 110;
  const calculatedHeight = headerHeight + (poll.options.length * (optionHeight + 14)) + footerHeight;
  const height = Math.max(700, calculatedHeight);

  // 2x Retina 스케일 적용 (더욱 선명한 화질)
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  ctx.scale(scale, scale);

  // 1. 깔끔한 라이트 모드 배경 (화이트/아이보리 베이스 + 은은한 퍼플 틴트)
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.4, '#fafafa');
  bgGrad.addColorStop(1, '#f5f3ff');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 상단 부드러운 라벤더 앰비언트 글로우
  const radialGlow = ctx.createRadialGradient(width / 2, 60, 10, width / 2, 60, 360);
  radialGlow.addColorStop(0, 'rgba(168, 85, 247, 0.12)');
  radialGlow.addColorStop(0.7, 'rgba(192, 132, 252, 0.04)');
  radialGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(0, 0, width, 400);

  // 세련된 외곽 테두리
  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  // 2. 상단 뱃지 [우주하마 방송 예측 · 투표 결과]
  const badgeX = 50;
  const badgeY = 46;
  const badgeWidth = 260;
  const badgeHeight = 32;
  
  ctx.fillStyle = '#f3e8ff';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 16);
  ctx.fill();
  ctx.strokeStyle = '#d8b4fe';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#7e22ce';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡ 우주하마 방송 예측 · 투표 결과', badgeX + 16, badgeY + badgeHeight / 2);

  // 3. 투표 타이틀 (진한 차콜 텍스트)
  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'top';
  const afterTitleY = wrapText(ctx, poll.title, 50, 98, width - 100, 38);

  // 4. 투표 부가 정보 (설명 및 통계)
  let statsY = afterTitleY + 6;
  if (poll.description) {
    ctx.fillStyle = '#71717a';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
    statsY = wrapText(ctx, poll.description, 50, statsY, width - 100, 22) + 10;
  }

  // 통계 뱃지 바
  ctx.fillStyle = '#f4f4f5';
  ctx.beginPath();
  ctx.roundRect(50, statsY, width - 100, 40, 12);
  ctx.fill();
  ctx.strokeStyle = '#e4e4e7';
  ctx.stroke();

  // 총 참여자 수 & 안내 문구
  ctx.fillStyle = '#6b21a8';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡ 실시간 무기명 투표 집계 현황', 68, statsY + 20);

  ctx.fillStyle = '#71717a';
  const dateStr = poll.endDate 
    ? `${format(new Date(poll.endDate), 'yyyy.MM.dd HH:mm', { locale: ko })} 종료` 
    : '투표 집계 완료';
  ctx.textAlign = 'right';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
  ctx.fillText(dateStr, width - 68, statsY + 20);

  // 5. 옵션 리스트 렌더링
  let optionStartY = statsY + 56;
  const sumVotes = poll.options.reduce((acc, o) => acc + (o.votes || 0), 0);
  const effectiveTotal = sumVotes > 0 ? sumVotes : (totalVotes || 0);
  const maxVote = Math.max(...poll.options.map(o => o.votes || 0), 0);

  poll.options.forEach((option, idx) => {
    const votes = option.votes || 0;
    const percentage = effectiveTotal > 0 ? Math.min(100, Math.round((votes / effectiveTotal) * 100)) : 0;
    const isWinner = votes > 0 && votes === maxVote;

    const optX = 50;
    const optY = optionStartY;
    const optW = width - 100;
    const optH = optionHeight;

    // 옵션 카드 배경 (깔끔한 화이트 / 1위는 은은한 라벤더)
    ctx.fillStyle = isWinner ? '#faf5ff' : '#ffffff';
    ctx.beginPath();
    ctx.roundRect(optX, optY, optW, optH, 16);
    ctx.fill();

    // 테두리
    ctx.strokeStyle = isWinner ? '#c084fc' : '#e4e4e7';
    ctx.lineWidth = isWinner ? 1.5 : 1;
    ctx.stroke();

    // 프로그레스 게이지 바
    const gaugeW = Math.max(0, Math.min(optW, (optW * percentage) / 100));
    if (gaugeW > 0) {
      const gaugeGrad = ctx.createLinearGradient(optX, 0, optX + gaugeW, 0);
      if (isWinner) {
        gaugeGrad.addColorStop(0, 'rgba(192, 132, 252, 0.28)');
        gaugeGrad.addColorStop(1, 'rgba(168, 85, 247, 0.38)');
      } else {
        gaugeGrad.addColorStop(0, 'rgba(228, 228, 231, 0.5)');
        gaugeGrad.addColorStop(1, 'rgba(212, 212, 216, 0.6)');
      }
      ctx.fillStyle = gaugeGrad;
      ctx.beginPath();
      ctx.roundRect(optX, optY, gaugeW, optH, 16);
      ctx.fill();
    }

    // 1위 뱃지 또는 순위 번호
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (isWinner) {
      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
      ctx.fillText('👑 1위', optX + 18, optY + optH / 2);
    } else {
      ctx.fillStyle = '#71717a';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`${idx + 1}위`, optX + 18, optY + optH / 2);
    }

    // 옵션 텍스트 (진한 텍스트)
    ctx.fillStyle = isWinner ? '#581c87' : '#18181b';
    ctx.font = isWinner 
      ? 'bold 17px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif'
      : '600 16px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
    
    let optText = option.text;
    const maxTextW = optW - 220;
    while (ctx.measureText(optText).width > maxTextW && optText.length > 3) {
      optText = optText.slice(0, -2) + '...';
    }
    ctx.fillText(optText, optX + 78, optY + optH / 2);

    // 우측 백분율 (%)
    ctx.textAlign = 'right';
    ctx.fillStyle = isWinner ? '#7e22ce' : '#27272a';
    ctx.font = isWinner
      ? 'bold 22px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif'
      : 'bold 19px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${percentage.toFixed(1)}%`, optX + optW - 22, optY + optH / 2);

    optionStartY += optH + 14;
  });

  // 6. 하단 워터마크 및 안내 푸터
  const footerY = height - 46;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
  ctx.fillText('우주하마 생방송 일정 & 게임 예측 플랫폼', 50, footerY);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#7e22ce';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif';
  ctx.fillText('우주하마 방송 예측', width - 50, footerY);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas to Blob conversion failed'));
      }
    }, 'image/png', 0.95);
  });
}
