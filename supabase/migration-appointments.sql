-- ============================================================================
-- Migration: นัดหมายของกลุ่ม (appointments)
-- รันไฟล์นี้ใน Supabase SQL Editor หลังรัน schema.sql (ไม่แก้ schema.sql เดิม)
-- เรียกซ้ำได้อย่างปลอดภัย (idempotent)
-- ============================================================================

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
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_group_date
  ON public.appointments (group_id, appt_date);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- anon ไม่มีสิทธิ์ใดๆ (ลิงก์แชร์ไม่แสดงนัดหมาย)
REVOKE ALL ON public.appointments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;

-- อ่าน: ผู้ใช้ที่ล็อกอิน (รวมผู้ชม) อ่านนัดหมายได้ เช่นเดียวกับตารางเรียน
DROP POLICY IF EXISTS "appointments_select_authenticated" ON public.appointments;
CREATE POLICY "appointments_select_authenticated"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (true);

-- เพิ่ม/แก้ไข: owner, admin, member เท่านั้น (ผู้ชมที่ล็อกอินแต่ไม่มีรหัสเชิญถูกปฏิเสธ)
DROP POLICY IF EXISTS "appointments_insert_group_members" ON public.appointments;
CREATE POLICY "appointments_insert_group_members"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_group_role(group_id) IN ('owner', 'admin', 'member')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "appointments_update_group_members" ON public.appointments;
CREATE POLICY "appointments_update_group_members"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'))
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

-- ลบ: owner/admin ลบได้ทุกนัด ส่วน member ลบได้เฉพาะนัดที่ตนเองสร้าง
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

-- อัปเดต updated_at อัตโนมัติ
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

-- เปิด Realtime (ถ้ายังไม่เปิด จะข้ามโดยไม่ error)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
