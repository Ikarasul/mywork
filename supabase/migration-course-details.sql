-- ============================================================================
-- ไฟล์ Migration รอบ 8: รายละเอียดรายวิชา (สี, โน้ต, ห้องเต็ม, ลิงก์) และข้อมูลการสอบ
-- ไฟล์: supabase/migration-course-details.sql
-- หมายเหตุ: รันไฟล์นี้ต่อจาก supabase/schema.sql ใน Supabase SQL Editor
-- ห้ามแก้ไขไฟล์ supabase/schema.sql เดิม และห้ามลดสิทธิ์/RLS ที่มีอยู่
-- ============================================================================

-- ============================================================================
-- 1. ฟังก์ชันตรวจสอบความถูกต้องของลิงก์รายวิชา (รับเฉพาะ https:// เท่านั้น)
-- ป้องกัน XSS และการโจมตีผ่านโปรโตคอลอันตราย เช่น javascript:, data:, vbscript:
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_course_links(p_links jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_item jsonb;
  v_type text;
  v_label text;
  v_url text;
BEGIN
  -- ต้องเป็น JSON Array เท่านั้น
  IF p_links IS NULL OR jsonb_typeof(p_links) <> 'array' THEN
    RETURN false;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_links)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RETURN false;
    END IF;

    v_type := COALESCE(v_item->>'type', '');
    v_label := trim(COALESCE(v_item->>'label', ''));
    v_url := trim(COALESCE(v_item->>'url', ''));

    -- ตรวจประเภทลิงก์ที่อนุญาต
    IF v_type NOT IN ('meet', 'line', 'contact', 'lms', 'other') THEN
      RETURN false;
    END IF;

    -- ต้องมีชื่อป้ายกำกับและ URL
    IF v_label = '' OR v_url = '' THEN
      RETURN false;
    END IF;

    -- บังคับระดับฐานข้อมูล: URL ต้องขึ้นต้นด้วย https:// เท่านั้น
    -- ปฏิเสธ javascript:, data:, file:, http:// และโปรโตคอลอื่นทั้งหมด
    IF v_url !~* '^https://[^\s]+$' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- ============================================================================
-- 2. เพิ่มคอลัมน์ในตาราง public.courses
--    - color: รหัสโทนสีของรายวิชา (เช่น 'mint', 'indigo', 'amber', 'sky', 'pink', 'emerald', 'violet', 'rose')
--    - notes: โน้ตบันทึกเพิ่มเติมของรายวิชา
--    - location_text: ข้อความห้องเรียนแบบเต็มจากตารางมหาวิทยาลัย (เช่น อาคาร 5 - สยามบรมราชกุมารี ชั้น 07 ห้อง 0704)
--    - links: รายการลิงก์ของวิชาในรูปแบบ JSONB Array [{type, label, url}]
-- ============================================================================
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- เพิ่ม CHECK Constraint บังคับให้ links ในตาราง courses ต้องผ่านฟังก์ชัน validate_course_links เสมอ
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_links_valid_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_links_valid_check
  CHECK (public.validate_course_links(links));

-- ============================================================================
-- 3. เพิ่มคอลัมน์สำหรับข้อมูลการสอบในตาราง public.tasks
--    - exam_room: ห้องสอบ (ใช้เมื่อ task_type = 'exam')
--    - exam_topics: หัวข้อหรือบทที่ออกสอบ (ใช้เมื่อ task_type = 'exam')
-- ============================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS exam_room text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exam_topics text NOT NULL DEFAULT '';

-- อัปเดต Trigger บังคับสิทธิ์การแก้ไขตาราง tasks ให้ครอบคลุมคอลัมน์ exam_room และ exam_topics ด้วย
-- (สิทธิ์ระดับ member ที่ได้รับมอบหมายงานจะเปลี่ยนได้เฉพาะ status เท่านั้น ห้ามแก้ห้องสอบหรือหัวข้อสอบ)
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
       OR NEW.exam_room IS DISTINCT FROM OLD.exam_room
       OR NEW.exam_topics IS DISTINCT FROM OLD.exam_topics
    THEN
      RAISE EXCEPTION 'สิทธิ์ระดับสมาชิก (member) สามารถอัปเดตได้เฉพาะสถานะงานที่ตนรับผิดชอบเท่านั้น ห้ามแก้ไขกำหนดส่ง ห้องสอบ หัวข้อสอบ หรือรายละเอียดงาน';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'คุณไม่มีสิทธิ์แก้ไขงานนี้';
END;
$$;

-- ============================================================================
-- 4. ยืนยันและคงสิทธิ์ RLS ของตาราง public.courses ตามนโยบายเดิม
--    - ผู้ใช้ที่ไม่ได้ล็อกอิน (anon) ไม่สามารถ SELECT/INSERT/UPDATE/DELETE ตาราง courses ได้เลย
--    - สมาชิกกลุ่มที่ล็อกอินอ่านข้อมูลรายวิชา (รวมถึง links และ notes) ได้
--    - ผู้แก้ไขขึ้นไป (owner, admin, member ในกลุ่ม) เท่านั้นที่แก้ไข (UPDATE) สี โน้ต และลิงก์ของวิชาได้
--    - ผู้ชมที่ล็อกอินแต่ไม่ได้เป็นสมาชิกกลุ่ม (ไม่มีรหัสเชิญ) จะถูก RLS ปฏิเสธเมื่อพยายาม UPDATE
-- ============================================================================
REVOKE ALL ON public.courses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;

DROP POLICY IF EXISTS "courses_update_group_members" ON public.courses;
CREATE POLICY "courses_update_group_members"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'))
  WITH CHECK (public.get_my_group_role(group_id) IN ('owner', 'admin', 'member'));

-- ============================================================================
-- 5. แก้ไขฟังก์ชัน RPC public.get_shared_view(token) ด้วย CREATE OR REPLACE
--    สำคัญมาก:
--    - ห้ามคืนคอลัมน์ links และ notes ของตาราง courses ให้แก่ผู้ชมผ่านลิงก์แชร์เด็ดขาด!
--    - คืนเฉพาะข้อมูลพื้นฐานของรายวิชา (id, course_code, course_name, credits, section,
--      instructor, online_link, color, location_text)
--    - คืนข้อมูล exam_room และ exam_topics ในรายการ tasks เพื่อให้ดูตารางสอบได้ตามปกติ
-- ============================================================================
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

  -- 1) ข้อมูลกลุ่ม (เฉพาะชื่อและคำอธิบาย ไม่รวมข้อมูลส่วนตัวผู้สร้าง)
  SELECT jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'description', g.description,
    'created_at', g.created_at
  )
  INTO v_group
  FROM public.groups g
  WHERE g.id = v_link.group_id;

  -- 2) ข้อมูลรายวิชา (บังคับระดับฐานข้อมูล: ไม่คืน links และไม่คืน notes อย่างเด็ดขาด!)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'course_code', c.course_code,
        'course_name', c.course_name,
        'credits', c.credits,
        'section', c.section,
        'instructor', c.instructor,
        'online_link', c.online_link,
        'color', c.color,
        'location_text', c.location_text
      )
      ORDER BY c.course_code ASC
    ),
    '[]'::jsonb
  )
  INTO v_courses
  FROM public.courses c
  WHERE c.group_id = v_link.group_id;

  -- 3) ข้อมูลคาบเรียน
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', cs.id,
        'course_id', cs.course_id,
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

  -- 4) ข้อมูลงาน/การบ้าน/สอบ (รวม exam_room และ exam_topics โดยไม่เปิดเผยอีเมลสมาชิก)
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
        'exam_room', t.exam_room,
        'exam_topics', t.exam_topics,
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
