-- =====================================================
-- 닭가슴살 특가 사이트 - Supabase 초기 설정 (완전판)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- =====================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS products (
  id             SERIAL  PRIMARY KEY,
  name           TEXT    NOT NULL,
  brand          TEXT    NOT NULL,
  store          TEXT    NOT NULL,
  category       TEXT    NOT NULL,
  flavor         TEXT    NOT NULL,
  weight         TEXT    NOT NULL,
  grams          INTEGER NOT NULL,
  emoji          TEXT    NOT NULL,
  thumbnail      TEXT,
  original_price INTEGER NOT NULL,
  sale_price     INTEGER NOT NULL,
  expiry_date    DATE    NOT NULL,
  link           TEXT    DEFAULT '#',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS 활성화
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 3. 익명 읽기 허용
CREATE POLICY "누구나 읽기 가능" ON products
  FOR SELECT USING (true);

-- 4. 데이터 삽입 (thumbnail + 링크 포함)
INSERT INTO products (name, brand, store, category, flavor, weight, grams, emoji, original_price, sale_price, expiry_date, link) VALUES
  ('하림 IFF 닭가슴살 훈제 슬라이스',    '하림',    '쿠팡',      '훈제',   '오리지널', '200g×5팩',  1000, '🍗', 18900, 12900, '2026-06-20', 'https://www.coupang.com/np/search?q=하림+IFF+닭가슴살+훈제+슬라이스'),
  ('동원 닭가슴살 통조림 135g',           '동원',    '이마트',    '통조림', '무염',     '135g×6캔',   810, '🥫', 14400,  8990, '2026-06-30', 'https://emart.ssg.com/search/search.ssg?query=동원+닭가슴살+통조림'),
  ('랭킹닭컴 오리지널 훈제 닭가슴살',    '랭킹닭컴','마켓컬리',  '훈제',   '오리지널', '100g×10개', 1000, '🍗', 22000, 15400, '2026-05-15', 'https://www.kurly.com/search?sword=랭킹닭컴+오리지널+훈제+닭가슴살'),
  ('맘스터치 닭가슴살 스테이크 오리지널','맘스터치','홈플러스',  '냉장',   '오리지널', '150g×3팩',   450, '🥩', 12000,  7990, '2026-05-18', 'https://www.homeplus.co.kr/search?keyword=맘스터치+닭가슴살+스테이크'),
  ('바디닭 저염 닭가슴살 큐브',           '바디닭',  '쿠팡',      '냉동',   '무염',     '1kg',       1000, '❄️', 19900, 13900, '2026-07-10', 'https://www.coupang.com/np/search?q=바디닭+저염+닭가슴살+큐브'),
  ('GS25 닭가슴살 샐러드 도시락',         'GS25',    'GS25',      '냉장',   '오리지널', '250g',       250, '🥗',  5500,  3990, '2026-04-30', 'https://www.gsshop.com/search/search.gs?keyword=닭가슴살+샐러드+도시락'),
  ('오뚜기 진짜닭가슴살 볼 스파이시',    '오뚜기',  '이마트',    '가공',   '매운맛',   '200g',       200, '🌶️',  6900,  4490, '2026-06-01', 'https://emart.ssg.com/search/search.ssg?query=오뚜기+진짜닭가슴살+볼+스파이시'),
  ('닭신 냉동 닭가슴살 무염',             '닭신',    '오늘의식탁','냉동',   '무염',     '500g×2팩',  1000, '❄️', 17500, 11900, '2026-08-30', 'https://www.kurly.com/search?sword=닭신+냉동+닭가슴살+무염'),
  ('풀무원 닭가슴살 소시지',              '풀무원',  '마켓컬리',  '가공',   '오리지널', '300g',       300, '🌭',  7800,  5200, '2026-05-25', 'https://www.kurly.com/search?sword=풀무원+닭가슴살+소시지'),
  ('프레시지 닭가슴살 샐러드 키트',      '프레시지','쿠팡',      '냉장',   '오리지널', '350g',       350, '🥗',  9900,  6390, '2026-05-16', 'https://www.coupang.com/np/search?q=프레시지+닭가슴살+샐러드+키트'),
  ('하림 닭가슴살 훈제 통구이',           '하림',    '홈플러스',  '훈제',   '오리지널', '250g',       250, '🍗',  8200,  5590, '2026-05-28', 'https://www.homeplus.co.kr/search?keyword=하림+닭가슴살+훈제+통구이'),
  ('사조 닭가슴살 캔 (물담금)',           '사조',    '이마트',    '통조림', '무염',     '200g×3캔',   600, '🥫',  9600,  5990, '2026-09-01', 'https://emart.ssg.com/search/search.ssg?query=사조+닭가슴살+캔'),
  ('바디닭 스파이시 훈제 닭가슴살',      '바디닭',  '올리브영',  '훈제',   '매운맛',   '100g×5개',   500, '🌶️', 13500,  9990, '2026-05-22', 'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=바디닭+스파이시+훈제+닭가슴살'),
  ('랭킹닭컴 닭가슴살 스테이크 갈릭',   '랭킹닭컴','쿠팡',      '냉장',   '갈릭',     '130g×5팩',   650, '🧄', 16500, 10900, '2026-05-17', 'https://www.coupang.com/np/search?q=랭킹닭컴+닭가슴살+스테이크+갈릭'),
  ('CJ 더건강한 닭가슴살 한입볼',        'CJ',      '마켓컬리',  '가공',   '오리지널', '450g',       450, '🍢', 11900,  8490, '2026-07-05', 'https://www.kurly.com/search?sword=CJ+더건강한+닭가슴살+한입볼'),
  ('닭신 양념 닭가슴살 간장구이',        '닭신',    '오늘의식탁','냉장',   '간장',     '200g×4팩',   800, '🍗', 19800, 13500, '2026-05-24', 'https://www.kurly.com/search?sword=닭신+양념+닭가슴살+간장구이');
