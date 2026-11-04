-- ============================================================================
-- migration-gcal-sync.sql
-- สร้างตารางนัดหมาย (appointments) หากยังไม่มี พร้อมเพิ่มคอลัมน์ gcal_event_id
-- และเพิ่ม gcal_event_id ให้ตารางงาน/สอบ (tasks)
-- วิธีใช้: คัดลอกโค้ดทั้งหมดไปรันใน Supabase SQL Editor
-- ============================================================================

-- 1. สร้างตาราง appointments หากยังไม่เคยสร้างมาก่อน
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  appt_date date NOT NULL,
  start_time text NOT NULL DEFAULT '09:00' CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text NOT NULL DEFAULT '10:00' CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  all_day boolean NOT NULL DEFAULT false,
  location text NOT NULL DEFAULT '' CHECK (char_length(location) <= 300),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  course_code text NOT NULL DEFAULT '',
  gcal_event_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- เพิ่มคอลัมน์ gcal_event_id หากมีตาราง appointments อยู่แล้วแต่ยังไม่มีคอลัมน์นี้
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS gcal_event_id text;

COMMENT ON COLUMN public.appointments.gcal_event_id IS 'รหัสอีเวนต์บน Google Calendar เพื่อใช้ในการอัปเดตและลบอีเวนต์แบบ 2 ทาง';

-- ดัชนีสำหรับค้นหานัดหมายตามกลุ่มและวันที่
CREATE INDEX IF NOT EXISTS idx_appointments_group_date
  ON public.appointments (group_id, appt_date);

-- เปิดใช้งานความปลอดภัยระดับแถว (Row Level Security - RLS)
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.appointments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;

-- นโยบาย RLS: สมาชิกที่ล็อกอินทุกคนสามารถดูนัดหมายได้
DROP POLICY IF EXISTS "appointments_select_authenticated" ON public.appointments;
CREATE POLICY "appointments_select_authenticated"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (true);

-- นโยบาย RLS: เพิ่มนัดหมายได้เฉพาะ owner, admin, member
DROP POLICY IF EXISTS "appointments_insert_group_members" ON public.appointments;
CREATE POLICY "appointments_insert_group_members"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_group_role(group_id) IN ('owner', 'admin', 'member')
    AND created_by = auth.uid()
  );

-- นโยบาย RLS: แก้ไขนัดหมายได้เฉพาะ owner, admin, member
DROP POLICY IF EXISTS "appointments_update_group_members" ON public.appointments;
CREATE POLICY "appointments_update_group_members"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'))
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

-- นโยบาย RLS: ลบนัดหมาย (owner/admin ลบได้หมด, member ลบได้เฉพาะนัดที่ตนเองสร้าง)
DROP POLICY IF EXISTS "appointments_delete_role_based" ON public.appointments;
CREATE POLICY "appointments_delete_role_based"
  ON public.appointments FOR DELETE
  TO authenticated
  USING (
    public.get_my_group_role(group_id) IN ('owner', 'admin')
    OR (
      public.get_my_group_role(group_id) = 'member'
      AND created_by = auth.uid()
    )
  );

-- Trigger อัปเดตเวลา updated_at อัตโนมัติเมื่อมีการแก้ไข
CREATE OR REPLACE FUNCTION public.touch_appointments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_appointments ON public.appointments;
CREATE TRIGGER trg_touch_appointments
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.touch_appointments_updated_at();

-- 2. เพิ่มคอลัมน์ gcal_event_id ในตาราง tasks (สำหรับการสอบ)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS gcal_event_id text;

COMMENT ON COLUMN public.tasks.gcal_event_id IS 'รหัสอีเวนต์การสอบบน Google Calendar เพื่อใช้ในการอัปเดตและลบอีเวนต์แบบ 2 ทาง';

-- 3. เปิด Realtime สำหรับตาราง appointments (หากเปิดไม่ได้จะข้ามไปไม่ error)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
