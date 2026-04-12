-- =====================================================
-- 닭가슴살 특가 사이트 - DB 업데이트
-- thumbnail 컬럼 추가 + 링크 채우기
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- =====================================================

-- 1. thumbnail 컬럼 추가
ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- 2. 링크 업데이트 (각 쇼핑몰 검색 결과 페이지)
UPDATE products SET link = 'https://www.coupang.com/np/search?q=하림+IFF+닭가슴살+훈제+슬라이스'
  WHERE name = '하림 IFF 닭가슴살 훈제 슬라이스';

UPDATE products SET link = 'https://emart.ssg.com/search/search.ssg?query=동원+닭가슴살+통조림'
  WHERE name = '동원 닭가슴살 통조림 135g';

UPDATE products SET link = 'https://www.kurly.com/search?sword=랭킹닭컴+오리지널+훈제+닭가슴살'
  WHERE name = '랭킹닭컴 오리지널 훈제 닭가슴살';

UPDATE products SET link = 'https://www.homeplus.co.kr/search?keyword=맘스터치+닭가슴살+스테이크'
  WHERE name = '맘스터치 닭가슴살 스테이크 오리지널';

UPDATE products SET link = 'https://www.coupang.com/np/search?q=바디닭+저염+닭가슴살+큐브'
  WHERE name = '바디닭 저염 닭가슴살 큐브';

UPDATE products SET link = 'https://www.gsshop.com/search/search.gs?keyword=닭가슴살+샐러드+도시락'
  WHERE name = 'GS25 닭가슴살 샐러드 도시락';

UPDATE products SET link = 'https://emart.ssg.com/search/search.ssg?query=오뚜기+진짜닭가슴살+볼+스파이시'
  WHERE name = '오뚜기 진짜닭가슴살 볼 스파이시';

UPDATE products SET link = 'https://www.kurly.com/search?sword=닭신+냉동+닭가슴살+무염'
  WHERE name = '닭신 냉동 닭가슴살 무염';

UPDATE products SET link = 'https://www.kurly.com/search?sword=풀무원+닭가슴살+소시지'
  WHERE name = '풀무원 닭가슴살 소시지';

UPDATE products SET link = 'https://www.coupang.com/np/search?q=프레시지+닭가슴살+샐러드+키트'
  WHERE name = '프레시지 닭가슴살 샐러드 키트';

UPDATE products SET link = 'https://www.homeplus.co.kr/search?keyword=하림+닭가슴살+훈제+통구이'
  WHERE name = '하림 닭가슴살 훈제 통구이';

UPDATE products SET link = 'https://emart.ssg.com/search/search.ssg?query=사조+닭가슴살+캔'
  WHERE name = '사조 닭가슴살 캔 (물담금)';

UPDATE products SET link = 'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=바디닭+스파이시+훈제+닭가슴살'
  WHERE name = '바디닭 스파이시 훈제 닭가슴살';

UPDATE products SET link = 'https://www.coupang.com/np/search?q=랭킹닭컴+닭가슴살+스테이크+갈릭'
  WHERE name = '랭킹닭컴 닭가슴살 스테이크 갈릭';

UPDATE products SET link = 'https://www.kurly.com/search?sword=CJ+더건강한+닭가슴살+한입볼'
  WHERE name = 'CJ 더건강한 닭가슴살 한입볼';

UPDATE products SET link = 'https://www.kurly.com/search?sword=닭신+양념+닭가슴살+간장구이'
  WHERE name = '닭신 양념 닭가슴살 간장구이';

-- 3. 확인
SELECT id, name, store, link, thumbnail FROM products ORDER BY id;
