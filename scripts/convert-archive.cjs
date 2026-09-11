const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 1. 파일 경로 설정 (우주하마 아카이브 엑셀 자동 탐색)
let EXCEL_FILENAME = '우주하마 생방송 아카이브 V3_3.xlsx';
if (!fs.existsSync(path.join(process.cwd(), EXCEL_FILENAME))) {
  EXCEL_FILENAME = '우주하마 생방송 아카이브 V3_2.xlsx';
}
if (!fs.existsSync(path.join(process.cwd(), EXCEL_FILENAME))) {
  EXCEL_FILENAME = '우주하마 생방송 아카이브 V3.xlsx';
}

const EXCEL_PATH = path.join(process.cwd(), EXCEL_FILENAME);
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'historical_logs.json');

if (!fs.existsSync(EXCEL_PATH)) {
  console.error(`❌ [오류] 엑셀 파일을 찾을 수 없습니다: ${EXCEL_PATH}`);
  process.exit(1);
}

console.log(`📖 엑셀 파일 로딩 중: ${EXCEL_FILENAME}`);
const workbook = xlsx.readFile(EXCEL_PATH, { cellFormula: true, cellHTML: true });
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const range = xlsx.utils.decode_range(worksheet['!ref']);

const logsMap = {};
let count = 0;

// 셀 데이터 추출 함수 (하이퍼링크 및 =HYPERLINK 수식 지원)
function getCellData(r, c) {
  const addr = xlsx.utils.encode_cell({ r, c });
  const cell = worksheet[addr];
  if (!cell) return { text: '', link: '' };

  let text = cell.v ? String(cell.v).trim() : '';
  let link = cell.l && cell.l.Target ? cell.l.Target : '';

  const formula = cell.f ? String(cell.f).trim() : '';
  if (formula.includes('HYPERLINK')) {
    const match = formula.match(/HYPERLINK\(\s*["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?\s*\)/i);
    if (match) {
      if (!link) link = match[1];
      if (!text || text.startsWith('=')) text = match[2] || '';
    }
  }

  return { text, link };
}

// 게임명 뒤의 닉네임, 사설, 불필요한 설명문 정제
function cleanGameName(rawName) {
  if (!rawName) return '';
  return rawName
    .split('\n')
    .map(line => {
      let trimmed = line.trim();
      if (/Among\s*Us/i.test(trimmed) && trimmed.includes(' - ')) {
        trimmed = trimmed.split(' - ')[0].trim();
      }
      if (/Sea\s*Of\s*Thieves/i.test(trimmed) && trimmed.includes(' - ')) {
        trimmed = trimmed.split(' - ')[0].trim();
      }
      if (/배틀그라운드/i.test(trimmed) && trimmed.includes(' - ')) {
        trimmed = trimmed.split(' - ')[0].trim();
      }
      if (/^JUST/i.test(trimmed) && trimmed.includes(' - ')) {
        trimmed = trimmed.split(' - ')[0].trim();
      }
      return trimmed;
    })
    .filter(Boolean)
    .join('\n');
}

// 데이터 파싱 (4행 헤더 이후부터 순회)
for (let r = 4; r <= range.e.r; r++) {
  // A열: 방송일
  const dateCell = getCellData(r, 0);
  const dateMatch = dateCell.text.match(/^(\d{4})\.(\d{2})\.(\d{2})\.?$/);
  if (!dateMatch) continue;

  const dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

  // ★ 2025년 12월 31일까지만 추출 (2026년 이후는 Firestore에서 관리하므로 제외)
  if (dateStr > '2025-12-31') continue;

  const logId = `${dateStr}_archive_${r}`;

  // C열: 다시보기 (우주하마 생방송!)
  const vodData = getCellData(r, 2);
  const vods = [];
  if (vodData.link || vodData.text) {
    vods.push({
      category: '종합',
      title: vodData.text || '우주하마 생방송!',
      url: vodData.link || ''
    });
  }

  // D열: 유튜브업로드 (편집본)
  const editData = getCellData(r, 3);
  const edited = [];
  if (editData.text || editData.link) {
    edited.push({
      category: '',
      title: editData.text || '유튜브 영상',
      url: editData.link || ''
    });
  }

  // E열: 게임 (컨텐츠)
  let rawGame = getCellData(r, 4).text;
  let gameText = cleanGameName(rawGame);

  // 과거 데이터 중 E열이 비어있는 경우 C열 방송 제목에서 게임명 보정
  if (!gameText && vodData.text) {
    if (/배틀그라운드|배그/i.test(vodData.text)) gameText = '배틀그라운드';
    else if (/오버워치/i.test(vodData.text)) gameText = '오버워치';
    else if (/오토체스/i.test(vodData.text)) gameText = '오토체스';
    else if (/렐름로얄/i.test(vodData.text)) gameText = '렐름로얄';
    else gameText = vodData.text.replace(/우주하마|생방송|실시간|★|♥/g, '').trim() || '종합 게임';
  }

  const games = [];
  if (gameText) {
    const splitGames = gameText.split('\n')
      .map(g => g.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\s]+/, '').trim())
      .filter(Boolean);

    splitGames.forEach(gName => {
      games.push({
        category: '',
        link: '',
        name: gName
      });
    });
  }

  // Firestore BroadcastLog 스키마에 맞춰 구성 (키워드, 오팬무, 오음무, 오저무, 웃음참기 제외)
  logsMap[logId] = {
    id: logId,
    date: dateStr,
    time: '',
    endTime: '',
    durationHours: 0.0,
    category: '종합',
    game: gameText || '종합 게임',
    games: games.length > 0 ? games : [{ category: '', link: '', name: gameText || '종합 게임' }],
    vods: vods,
    edited: edited,
    shorts: [],
    absenceReasons: []
  };

  count++;
}

// 2. public/data 디렉토리에 JSON 파일 저장
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(logsMap, null, 2), 'utf-8');

console.log(`\n=============================================`);
console.log(`✅ 2016년 ~ 2025년 12월 31일 아카이브 추출 완료!`);
console.log(`- 추출된 방송 로그 수: ${count}개`);
console.log(`- 파일 저장 경로: ${OUTPUT_PATH}`);
console.log(`=============================================`);