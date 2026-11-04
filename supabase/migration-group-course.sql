-- ============================================================================
-- migration-group-course.sql
-- เพิ่มคอลัมน์ source_course_code และ color ในตาราง groups
-- เพื่อรองรับการสร้างกลุ่มจากการเลือกรายวิชา และการกำหนดแถบสีประจำกลุ่ม
-- ============================================================================

-- 1. เพิ่มคอลัมน์ source_course_code (รหัสวิชาต้นทางที่ใช้สร้างกลุ่ม เช่น MGT33267)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS source_course_code text;

COMMENT ON COLUMN public.groups.source_course_code IS 'รหัสวิชาต้นทางที่ใช้สร้างกลุ่ม เช่น MGT33267';

-- 2. เพิ่มคอลัมน์ color (รหัสธีมสีประจำกลุ่ม เช่น mint, indigo, amber, sky, pink, rose, violet, teal)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS color text DEFAULT 'indigo';

COMMENT ON COLUMN public.groups.color IS 'รหัสธีมสีประจำกลุ่ม (เช่น mint, indigo, amber, sky, pink, rose, violet, teal)';

-- ============================================================================
-- สิ้นสุด migration-group-course.sql
-- ============================================================================
