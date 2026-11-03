-- ============================================================================
-- ระบบจัดตารางชีวิตและการเรียน (Life & Study Planner)
-- ไฟล์โครงสร้างฐานข้อมูลและนโยบายความปลอดภัย (Row Level Security - RLS)
-- วิธีใช้: คัดลอกโค้ดทั้งหมดในไฟล์นี้ไปรันใน Supabase SQL Editor
-- ============================================================================

-- เปิดใช้งานส่วนขยายสำหรับเข้ารหัส SHA-256 (ใช้เก็บ hash ของรหัสเชิญ)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. สร้างตารางข้อมูลทั้งหมด (10 ตาราง)
-- ============================================================================

-- 1.1 ตารางโปรไฟล์ผู้ใช้ (ไม่เก็บอีเมลในฟิลด์สาธารณะ เพื่อป้องกันการรั่วไหลของข้อมูลส่วนตัว)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'ผู้ใช้งาน',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.2 ตารางกลุ่มเรียน/กลุ่มทำงาน
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.3 ตารางสมาชิกในกลุ่ม (role: owner / admin / member)
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

-- 1.4 ตารางรหัสเชิญเข้ากลุ่ม (เก็บเฉพาะค่า SHA-256 hash ในคอลัมน์ code_hash ห้ามเก็บรหัสจริง)
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  expires_at timestamptz,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.5 ตารางรายวิชา (ผูกกับ group_id)
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  course_name text NOT NULL,
  credits integer NOT NULL DEFAULT 3,
  section text NOT NULL DEFAULT '001',
  instructor text NOT NULL DEFAULT '',
  online_link boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.6 ตารางคาบเรียน/ตารางเรียน (ผูกกับ group_id และรายวิชา)
CREATE TABLE IF NOT EXISTS public.class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  course_name text NOT NULL,
  credits integer NOT NULL DEFAULT 3,
  section text NOT NULL DEFAULT '001',
  day text NOT NULL CHECK (day IN ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')),
  start_time text NOT NULL,
  end_time text NOT NULL,
  room text NOT NULL DEFAULT '',
  instructor text NOT NULL DEFAULT '',
  online_link boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.7 ตารางงาน/การบ้าน/สอบ (ผูกกับ group_id และเก็บผู้รับผิดชอบใน assignee_ids)
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  task_type text NOT NULL DEFAULT 'homework' CHECK (task_type IN ('work', 'homework', 'exam')),
  course_code text NOT NULL DEFAULT '',
  due_date timestamptz,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assignee_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.8 ตารางข้อความแชทกลุ่ม (ผูกกับ group_id พร้อมฟิลด์ pinned สำหรับปักหมุดข้อความ)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL DEFAULT 'สมาชิก',
  content text NOT NULL CHECK (char_length(trim(content)) > 0),
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.9 ตารางตารางชีวิตส่วนตัว (routine_items: เห็นและจัดการได้เฉพาะเจ้าของแถวเท่านั้น)
CREATE TABLE IF NOT EXISTS public.routine_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  day text NOT NULL CHECK (day IN ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'ALL')),
  start_time text NOT NULL,
  end_time text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.10 ตารางลิงก์แชร์ดูอย่างเดียว (token สุ่มยาว ยกเลิกได้)
CREATE TABLE IF NOT EXISTS public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. ฟังก์ชันช่วยเหลือและ Triggers สำหรับจัดการสิทธิ์และความถูกต้องของข้อมูล
-- ============================================================================

-- ฟังก์ชันสร้างโปรไฟล์อัตโนมัติเมื่อผู้ใช้ล็อกอิน/สมัครสมาชิกใหม่ (ไม่นำอีเมลเต็มไปแสดงสาธารณะ)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
BEGIN
  v_prefix := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    split_part(COALESCE(NEW.email, 'user'), '@', 1),
    'ผู้ใช้งาน'
  );
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, v_prefix)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ฟังก์ชันเพิ่มผู้สร้างกลุ่มเป็น owner อัตโนมัติเมื่อสร้างกลุ่มใหม่
CREATE OR REPLACE FUNCTION public.handle_new_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_group_created ON public.groups;
CREATE TRIGGER on_group_created
  AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_group();

-- ฟังก์ชันตรวจบทบาท (role) ของผู้ใช้ปัจจุบันในกลุ่มที่ระบุ
CREATE OR REPLACE FUNCTION public.get_my_group_role(p_group_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.group_members
  WHERE group_id = p_group_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Trigger บังคับกฎระดับฐานข้อมูลสำหรับตาราง tasks:
-- หากผู้แก้ไขเป็นเพียง 'member' (ไม่ใช่ 'owner' หรือ 'admin') จะอนุญาตให้อัปเดตได้เฉพาะคอลัมน์ status เท่านั้น
-- ห้ามแก้กำหนดส่ง (due_date), ชื่องาน, รายละเอียด หรือรายชื่อผู้รับผิดชอบโดยเด็ดขาด
CREATE OR REPLACE FUNCTION public.enforce_task_update_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.get_my_group_role(OLD.group_id);

  IF v_role IN ('owner', 'admin') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF v_role = 'member' AND (auth.uid() = ANY(OLD.assignee_ids)) THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.task_type IS DISTINCT FROM OLD.task_type
       OR NEW.course_code IS DISTINCT FROM OLD.course_code
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.assignee_ids IS DISTINCT FROM OLD.assignee_ids
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
    THEN
      RAISE EXCEPTION 'สิทธิ์ระดับสมาชิก (member) สามารถอัปเดตได้เฉพาะสถานะงานที่ตนรับผิดชอบเท่านั้น ห้ามแก้ไขกำหนดส่งหรือรายละเอียดงาน';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'คุณไม่มีสิทธิ์แก้ไขงานนี้';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_update ON public.tasks;
CREATE TRIGGER trg_enforce_task_update
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_update_permissions();

-- ============================================================================
-- 3. เปิดใช้งาน Row Level Security (RLS) ทุกตาราง และจำกัดสิทธิ์ผู้ใช้ anon
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- ห้ามผู้ใช้ที่ไม่ได้ล็อกอิน (anon) อ่านหรือเขียนทุกตารางโดยตรง (ต้องเรียก RPC get_shared_view เท่านั้น)
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.groups FROM anon;
REVOKE ALL ON public.group_members FROM anon;
REVOKE ALL ON public.invite_codes FROM anon;
REVOKE ALL ON public.courses FROM anon;
REVOKE ALL ON public.class_sessions FROM anon;
REVOKE ALL ON public.tasks FROM anon;
REVOKE ALL ON public.messages FROM anon;
REVOKE ALL ON public.routine_items FROM anon;
REVOKE ALL ON public.share_links FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routine_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO authenticated;

-- ============================================================================
-- 4. นโยบายความปลอดภัย (RLS Policies) พร้อมคำอธิบายภาษาไทยทุกนโยบาย
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 ตาราง profiles
-- ----------------------------------------------------------------------------
-- นโยบาย: ผู้ใช้ที่ล็อกอินแล้วสามารถอ่านชื่อแสดงผล (display_name) ของสมาชิกได้ (ไม่มีอีเมลในตารางนี้)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- นโยบาย: ผู้ใช้สร้างและแก้ไขโปรไฟล์ของตนเองได้เท่านั้น
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4.2 ตาราง groups
-- ----------------------------------------------------------------------------
-- นโยบาย: ผู้ใช้ที่ล็อกอินแล้ว (ทั้งสมาชิกกลุ่มและผู้ชมที่ล็อกอินแต่ยังไม่มีรหัสเชิญ) สามารถอ่านข้อมูลกลุ่มได้
DROP POLICY IF EXISTS "groups_select_authenticated" ON public.groups;
CREATE POLICY "groups_select_authenticated"
  ON public.groups FOR SELECT
  TO authenticated
  USING (true);

-- นโยบาย: ผู้ใช้ที่ล็อกอินแล้วสามารถสร้างกลุ่มใหม่ได้โดยระบุตนเองเป็นผู้สร้าง (และกลายเป็น owner อัตโนมัติ)
DROP POLICY IF EXISTS "groups_insert_authenticated" ON public.groups;
CREATE POLICY "groups_insert_authenticated"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- นโยบาย: แก้ไขข้อมูลกลุ่มได้เฉพาะสมาชิกที่มีสิทธิ์ owner, admin หรือ member ในกลุ่มนั้น
DROP POLICY IF EXISTS "groups_update_members" ON public.groups;
CREATE POLICY "groups_update_members"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(id) IN ('owner', 'admin', 'member'))
  WITH CHECK (public.get_my_group_role(id) IN ('owner', 'admin', 'member'));

-- นโยบาย: ลบกลุ่มได้เฉพาะเจ้าของกลุ่ม (owner) เท่านั้น
DROP POLICY IF EXISTS "groups_delete_owner" ON public.groups;
CREATE POLICY "groups_delete_owner"
  ON public.groups FOR DELETE
  TO authenticated
  USING (public.get_my_group_role(id) = 'owner');

-- ----------------------------------------------------------------------------
-- 4.3 ตาราง group_members
-- ----------------------------------------------------------------------------
-- นโยบาย: ผู้ใช้ที่ล็อกอินแล้วสามารถดูรายชื่อสมาชิกและบทบาทในกลุ่มได้
DROP POLICY IF EXISTS "group_members_select_authenticated" ON public.group_members;
CREATE POLICY "group_members_select_authenticated"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (true);

-- นโยบาย: เฉพาะเจ้าของกลุ่ม (owner) เท่านั้นที่เพิ่มสมาชิกโดยตรงได้ (การเข้ากลุ่มด้วยรหัสเชิญจะผ่านฟังก์ชัน redeem_invite_code)
DROP POLICY IF EXISTS "group_members_insert_owner" ON public.group_members;
CREATE POLICY "group_members_insert_owner"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_group_role(group_id) = 'owner');

-- นโยบาย: เฉพาะเจ้าของกลุ่ม (owner) เท่านั้นที่เปลี่ยนบทบาท (role) ของสมาชิกในกลุ่มได้
DROP POLICY IF EXISTS "group_members_update_owner" ON public.group_members;
CREATE POLICY "group_members_update_owner"
  ON public.group_members FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) = 'owner')
  WITH CHECK (public.get_my_group_role(group_id) = 'owner');

-- นโยบาย: เฉพาะเจ้าของกลุ่ม (owner) เท่านั้นที่ถอดสมาชิกออกจากกลุ่มได้ (หรือสมาชิกกดออกจากกลุ่มเองยกเว้น owner)
DROP POLICY IF EXISTS "group_members_delete_owner" ON public.group_members;
CREATE POLICY "group_members_delete_owner"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    public.get_my_group_role(group_id) = 'owner'
    AND user_id <> auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 4.4 ตาราง invite_codes
-- ----------------------------------------------------------------------------
-- นโยบาย: เฉพาะเจ้าของกลุ่ม (owner) และผู้ดูแล (admin) เท่านั้นที่มองเห็นรายการรหัสเชิญได้
DROP POLICY IF EXISTS "invite_codes_select_owner_admin" ON public.invite_codes;
CREATE POLICY "invite_codes_select_owner_admin"
  ON public.invite_codes FOR SELECT
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin'));

-- นโยบาย: เฉพาะเจ้าของกลุ่ม (owner) เท่านั้นที่สร้างรหัสเชิญใหม่ได้ (ตามหลักการสิทธิ์: เจ้าของสร้าง/ยกเลิกรหัสเชิญ)
DROP POLICY IF EXISTS "invite_codes_insert_owner" ON public.invite_codes;
CREATE POLICY "invite_codes_insert_owner"
  ON public.invite_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_group_role(group_id) IN ('owner', 'admin')
    AND created_by = auth.uid()
  );

-- นโยบาย: เฉพาะเจ้าของกลุ่ม (owner) และผู้ดูแล (admin) เท่านั้นที่ยกเลิกหรือแก้ไขรหัสเชิญได้
DROP POLICY IF EXISTS "invite_codes_update_owner_admin" ON public.invite_codes;
CREATE POLICY "invite_codes_update_owner_admin"
  ON public.invite_codes FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin'))
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin'));

-- นโยบาย: เฉพาะเจ้าของกลุ่ม (owner) และผู้ดูแล (admin) เท่านั้นที่ลบรหัสเชิญได้
DROP POLICY IF EXISTS "invite_codes_delete_owner_admin" ON public.invite_codes;
CREATE POLICY "invite_codes_delete_owner_admin"
  ON public.invite_codes FOR DELETE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin'));

-- ----------------------------------------------------------------------------
-- 4.5 ตาราง courses (รายวิชาของกลุ่ม)
-- ----------------------------------------------------------------------------
-- นโยบาย: สมาชิกกลุ่มและผู้ชมที่ล็อกอินสามารถอ่านข้อมูลรายวิชาได้
DROP POLICY IF EXISTS "courses_select_authenticated" ON public.courses;
CREATE POLICY "courses_select_authenticated"
  ON public.courses FOR SELECT
  TO authenticated
  USING (true);

-- นโยบาย: เพิ่ม/แก้ไข/ลบรายวิชาได้เฉพาะสมาชิกกลุ่มที่มี role เป็น owner, admin หรือ member เท่านั้น
DROP POLICY IF EXISTS "courses_insert_group_members" ON public.courses;
CREATE POLICY "courses_insert_group_members"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

DROP POLICY IF EXISTS "courses_update_group_members" ON public.courses;
CREATE POLICY "courses_update_group_members"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'))
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

DROP POLICY IF EXISTS "courses_delete_group_members" ON public.courses;
CREATE POLICY "courses_delete_group_members"
  ON public.courses FOR DELETE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

-- ----------------------------------------------------------------------------
-- 4.6 ตาราง class_sessions (คาบเรียนในตารางเรียนของกลุ่ม)
-- ----------------------------------------------------------------------------
-- นโยบาย: สมาชิกกลุ่มและผู้ชมที่ล็อกอินสามารถอ่านตารางเรียนได้
DROP POLICY IF EXISTS "class_sessions_select_authenticated" ON public.class_sessions;
CREATE POLICY "class_sessions_select_authenticated"
  ON public.class_sessions FOR SELECT
  TO authenticated
  USING (true);

-- นโยบาย: เพิ่ม/แก้ไข/ลบคาบเรียนได้เฉพาะสมาชิกกลุ่มที่มี role เป็น owner, admin หรือ member เท่านั้น
DROP POLICY IF EXISTS "class_sessions_insert_group_members" ON public.class_sessions;
CREATE POLICY "class_sessions_insert_group_members"
  ON public.class_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

DROP POLICY IF EXISTS "class_sessions_update_group_members" ON public.class_sessions;
CREATE POLICY "class_sessions_update_group_members"
  ON public.class_sessions FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'))
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

DROP POLICY IF EXISTS "class_sessions_delete_group_members" ON public.class_sessions;
CREATE POLICY "class_sessions_delete_group_members"
  ON public.class_sessions FOR DELETE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

-- ----------------------------------------------------------------------------
-- 4.7 ตาราง tasks (งาน/การบ้าน/สอบ)
-- ----------------------------------------------------------------------------
-- นโยบาย: สมาชิกกลุ่มและผู้ชมที่ล็อกอินสามารถอ่านรายการงานได้
DROP POLICY IF EXISTS "tasks_select_authenticated" ON public.tasks;
CREATE POLICY "tasks_select_authenticated"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (true);

-- นโยบาย: สร้างและมอบหมายงาน (INSERT) ได้เฉพาะ owner และ admin เท่านั้น
DROP POLICY IF EXISTS "tasks_insert_owner_admin" ON public.tasks;
CREATE POLICY "tasks_insert_owner_admin"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin'));

-- นโยบาย: แก้ไขงาน (UPDATE) อนุญาตให้ owner/admin แก้ไขได้ทั้งหมด
-- ส่วน member แก้ไขได้เฉพาะงานที่ตนเองอยู่ใน assignee_ids (และ Trigger จะจำกัดให้แก้ได้เฉพาะ status เท่านั้น)
DROP POLICY IF EXISTS "tasks_update_role_based" ON public.tasks;
CREATE POLICY "tasks_update_role_based"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    public.get_my_group_role(group_id) IN ('owner', 'admin')
    OR (
      public.get_my_group_role(group_id) = 'member'
      AND (auth.uid() = ANY(assignee_ids))
    )
  )
  WITH CHECK (
    public.get_my_group_role(group_id) IN ('owner', 'admin')
    OR (
      public.get_my_group_role(group_id) = 'member'
      AND (auth.uid() = ANY(assignee_ids))
    )
  );

-- นโยบาย: ลบงาน (DELETE) ได้เฉพาะ owner และ admin เท่านั้น
DROP POLICY IF EXISTS "tasks_delete_owner_admin" ON public.tasks;
CREATE POLICY "tasks_delete_owner_admin"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin'));

-- ----------------------------------------------------------------------------
-- 4.8 ตาราง messages (แชทกลุ่ม)
-- ----------------------------------------------------------------------------
-- นโยบาย: สมาชิกกลุ่มและผู้ชมที่ล็อกอินสามารถอ่านข้อความแชทในกลุ่มได้
DROP POLICY IF EXISTS "messages_select_authenticated" ON public.messages;
CREATE POLICY "messages_select_authenticated"
  ON public.messages FOR SELECT
  TO authenticated
  USING (true);

-- นโยบาย: ส่งข้อความใหม่ได้เฉพาะสมาชิกที่มี role เป็น owner, admin หรือ member เท่านั้น (ผู้ชมที่ยังไม่มีรหัสเชิญส่งไม่ได้)
DROP POLICY IF EXISTS "messages_insert_group_members" ON public.messages;
CREATE POLICY "messages_insert_group_members"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_group_role(group_id) IN ('owner', 'admin', 'member')
    AND sender_id = auth.uid()
  );

-- นโยบาย: ปักหมุด/แก้ไขข้อความได้เฉพาะสมาชิกที่มี role เป็น owner, admin หรือ member ในกลุ่ม
DROP POLICY IF EXISTS "messages_update_group_members" ON public.messages;
CREATE POLICY "messages_update_group_members"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'))
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

-- นโยบาย: ลบข้อความได้เฉพาะเจ้าของข้อความ หรือ owner/admin ของกลุ่ม
DROP POLICY IF EXISTS "messages_delete_sender_or_admin" ON public.messages;
CREATE POLICY "messages_delete_sender_or_admin"
  ON public.messages FOR DELETE
  TO authenticated
  USING (
    (sender_id = auth.uid() AND public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'))
    OR public.get_my_group_role(group_id) IN ('owner', 'admin')
  );

-- ----------------------------------------------------------------------------
-- 4.9 ตาราง routine_items (ตารางชีวิตส่วนตัว)
-- ----------------------------------------------------------------------------
-- นโยบาย: เจ้าของแถว (user_id = auth.uid()) เท่านั้นที่อ่าน เพิ่ม แก้ไข และลบตารางชีวิตของตนเองได้
DROP POLICY IF EXISTS "routine_items_select_own" ON public.routine_items;
CREATE POLICY "routine_items_select_own"
  ON public.routine_items FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "routine_items_insert_own" ON public.routine_items;
CREATE POLICY "routine_items_insert_own"
  ON public.routine_items FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "routine_items_update_own" ON public.routine_items;
CREATE POLICY "routine_items_update_own"
  ON public.routine_items FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "routine_items_delete_own" ON public.routine_items;
CREATE POLICY "routine_items_delete_own"
  ON public.routine_items FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4.10 ตาราง share_links (ลิงก์แชร์ดูอย่างเดียว)
-- ----------------------------------------------------------------------------
-- นโยบาย: เฉพาะ owner และ admin ของกลุ่มเท่านั้นที่ดู สร้าง ยกเลิก หรือลบลิงก์แชร์ได้
DROP POLICY IF EXISTS "share_links_select_owner_admin" ON public.share_links;
CREATE POLICY "share_links_select_owner_admin"
  ON public.share_links FOR SELECT
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "share_links_insert_owner_admin" ON public.share_links;
CREATE POLICY "share_links_insert_owner_admin"
  ON public.share_links FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_group_role(group_id) IN ('owner', 'admin')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "share_links_update_owner_admin" ON public.share_links;
CREATE POLICY "share_links_update_owner_admin"
  ON public.share_links FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin'))
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "share_links_delete_owner_admin" ON public.share_links;
CREATE POLICY "share_links_delete_owner_admin"
  ON public.share_links FOR DELETE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin'));

-- ============================================================================
-- 5. ฟังก์ชัน RPC แบบ SECURITY DEFINER
-- ============================================================================

-- 5.1 ฟังก์ชัน redeem_invite_code(code):
-- ตรวจรหัสเชิญด้วยค่า SHA-256 hash, วันหมดอายุ, จำนวนครั้งสูงสุด และสถานะยกเลิก
-- แล้วเพิ่มผู้ใช้ที่ล็อกอินเข้าเป็นสมาชิกกลุ่มตาม role ของรหัสเชิญ
CREATE OR REPLACE FUNCTION public.redeem_invite_code(code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_clean_code text;
  v_code_hash text;
  v_invite public.invite_codes%ROWTYPE;
  v_existing_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบก่อนใช้รหัสเชิญ';
  END IF;

  v_clean_code := trim(COALESCE(code, ''));
  IF v_clean_code = '' THEN
    RAISE EXCEPTION 'กรุณากรอกรหัสเชิญ';
  END IF;

  -- คำนวณ SHA-256 hash ของรหัสเชิญเพื่อเปรียบเทียบกับ code_hash ในฐานข้อมูล
  v_code_hash := encode(digest(v_clean_code, 'sha256'), 'hex');

  SELECT *
  INTO v_invite
  FROM public.invite_codes
  WHERE code_hash = v_code_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'รหัสเชิญไม่ถูกต้อง';
  END IF;

  IF v_invite.revoked THEN
    RAISE EXCEPTION 'รหัสเชิญนี้ถูกยกเลิกแล้ว';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'รหัสเชิญนี้หมดอายุแล้ว';
  END IF;

  IF v_invite.max_uses IS NOT NULL AND v_invite.used_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'รหัสเชิญนี้ถูกใช้งานครบจำนวนครั้งที่กำหนดแล้ว';
  END IF;

  -- ตรวจสอบว่าผู้ใช้เป็นสมาชิกอยู่แล้วหรือไม่ (ถ้าเป็น owner อยู่แล้วจะไม่ลดสิทธิ์)
  SELECT role INTO v_existing_role
  FROM public.group_members
  WHERE group_id = v_invite.group_id
    AND user_id = v_user_id;

  IF v_existing_role = 'owner' THEN
    RAISE EXCEPTION 'คุณเป็นเจ้าของกลุ่มนี้อยู่แล้ว';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_invite.group_id, v_user_id, v_invite.role)
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.invite_codes
  SET used_count = used_count + 1
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', v_invite.group_id,
    'role', v_invite.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text) TO authenticated;

-- 5.2 ฟังก์ชัน get_shared_view(token):
-- คืนข้อมูลอ่านอย่างเดียวของกลุ่ม (ชื่อกลุ่ม, รายวิชา, ตารางเรียน, งาน) สำหรับผู้เปิดลิงก์แชร์โดยไม่ต้องล็อกอิน
-- ห้ามคืนอีเมลหรือข้อมูลส่วนตัวของสมาชิกโดยเด็ดขาด
CREATE OR REPLACE FUNCTION public.get_shared_view(token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_token text;
  v_link public.share_links%ROWTYPE;
  v_group jsonb;
  v_courses jsonb;
  v_sessions jsonb;
  v_tasks jsonb;
BEGIN
  v_clean_token := trim(COALESCE(token, ''));
  IF v_clean_token = '' THEN
    RAISE EXCEPTION 'ไม่พบโทเคนสำหรับลิงก์แชร์';
  END IF;

  SELECT *
  INTO v_link
  FROM public.share_links
  WHERE share_links.token = v_clean_token
    AND share_links.revoked = false
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ลิงก์แชร์ไม่ถูกต้องหรือถูกยกเลิกแล้ว';
  END IF;

  -- ข้อมูลกลุ่ม (เฉพาะชื่อและคำอธิบาย ไม่รวมข้อมูลส่วนตัวผู้สร้าง)
  SELECT jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'description', g.description,
    'created_at', g.created_at
  )
  INTO v_group
  FROM public.groups g
  WHERE g.id = v_link.group_id;

  -- ข้อมูลรายวิชา
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'course_code', c.course_code,
        'course_name', c.course_name,
        'credits', c.credits,
        'section', c.section,
        'instructor', c.instructor,
        'online_link', c.online_link
      )
      ORDER BY c.course_code ASC
    ),
    '[]'::jsonb
  )
  INTO v_courses
  FROM public.courses c
  WHERE c.group_id = v_link.group_id;

  -- ข้อมูลคาบเรียน
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', cs.id,
        'course_code', cs.course_code,
        'course_name', cs.course_name,
        'credits', cs.credits,
        'section', cs.section,
        'day', cs.day,
        'start_time', cs.start_time,
        'end_time', cs.end_time,
        'room', cs.room,
        'instructor', cs.instructor,
        'online_link', cs.online_link
      )
      ORDER BY cs.day ASC, cs.start_time ASC
    ),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM public.class_sessions cs
  WHERE cs.group_id = v_link.group_id;

  -- ข้อมูลงาน/การบ้าน/สอบ (แปลงผู้รับผิดชอบเป็นชื่อแสดงผลเท่านั้น ห้ามแสดงอีเมลหรือ user_id ดิบหากไม่จำเป็น)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'task_type', t.task_type,
        'course_code', t.course_code,
        'due_date', t.due_date,
        'status', t.status,
        'assignee_names', COALESCE(
          (
            SELECT jsonb_agg(p.display_name)
            FROM public.profiles p
            WHERE p.id = ANY(t.assignee_ids)
          ),
          '[]'::jsonb
        )
      )
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_tasks
  FROM public.tasks t
  WHERE t.group_id = v_link.group_id;

  RETURN jsonb_build_object(
    'group', v_group,
    'courses', v_courses,
    'class_sessions', v_sessions,
    'tasks', v_tasks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_view(text) TO anon, authenticated;

-- ============================================================================
-- 6. เปิดใช้งาน Realtime สำหรับตารางข้อความแชท (messages) และงาน (tasks)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
END $$;
