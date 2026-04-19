-- =====================================================
-- events 테이블의 start_date / end_date 를 DATE → TIMESTAMPTZ 로 변경
-- 시/분 단위까지 저장 가능하게 함
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- (이미 TIMESTAMPTZ 인 경우 이 스크립트는 건너뛰세요)
-- =====================================================

ALTER TABLE events
  ALTER COLUMN start_date TYPE TIMESTAMPTZ USING (start_date::TIMESTAMPTZ),
  ALTER COLUMN end_date   TYPE TIMESTAMPTZ USING (end_date::TIMESTAMPTZ);
