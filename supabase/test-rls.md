# คู่มือทดสอบสิทธิ์ฐานข้อมูล (Row Level Security - RLS) ด้วย 2 บัญชี

เอกสารนี้ระบุขั้นตอนการตรวจสอบว่านโยบายความปลอดภัยระดับแถว (RLS) ใน `supabase/schema.sql` ทำงานได้ถูกต้องตามหลักการสิทธิ์ที่กำหนด โดยไม่พึ่งพาการซ่อนปุ่มบนหน้าเว็บเพียงอย่างเดียว

---

## การเตรียมตัวก่อนทดสอบ

1. เปิด **Supabase Dashboard > SQL Editor** แล้ววางโค้ดทั้งหมดจากไฟล์ `supabase/schema.sql` และกด **Run**
2. เตรียมอีเมลสำหรับทดสอบ 2 บัญชี:
   * **บัญชี A (Owner):** สำหรับสร้างกลุ่ม สร้างรหัสเชิญ และจัดการลิงก์แชร์ (เปิดในเบราว์เซอร์ปกติ)
   * **บัญชี B (Viewer -> Member):** สำหรับทดสอบผู้ใช้ที่ล็อกอินแต่ยังไม่มีรหัสเชิญ และทดสอบการกรอกรหัสเชิญ (เปิดในโปรไฟล์เบราว์เซอร์แยก หรือหน้าต่าง Private อีกชุด)
   * **หน้าต่างไม่ระบุตัวตน (Anon / Incognito):** สำหรับทดสอบผู้ชมที่ไม่ได้ล็อกอินผ่าน `/share/:token`

---

## ขั้นตอนที่ 1: ทดสอบบัญชี A (เจ้าของกลุ่ม - Owner)

1. ล็อกอินด้วย **บัญชี A** ที่หน้า `/login` ผ่าน Magic Link
2. ไปที่หน้า `/group` แล้วสร้างกลุ่มใหม่ เช่น `"กลุ่มเรียนเทอม 1"`
   * **ผลลัพธ์ที่ต้องได้:** ระบบแสดงสิทธิ์ปัจจุบันเป็น **เจ้าของ (Owner)**
3. ไปที่หน้า `/schedule` และ `/tasks` เพื่อเพิ่มตารางเรียนและสร้างงานใหม่
   * **ผลลัพธ์ที่ต้องได้:** สร้างรายวิชา คาบเรียน และมอบหมายงานได้สำเร็จ
4. ที่หน้า `/group` สร้างรหัสเชิญ 2 รหัส:
   * **รหัสที่ 1 (สำหรับใช้งานจริง):** บทบาท `member`, กำหนดจำนวนครั้ง `1` ครั้ง, วันหมดอายุในอนาคต (คัดลอกรหัสเต็มเก็บไว้)
   * **รหัสที่ 2 (สำหรับทดสอบการยกเลิก):** สร้างแล้วกดปุ่ม **ยกเลิกรหัส** ทันที
5. สร้าง **ลิงก์แชร์ดูอย่างเดียว** (`/share/:token`) แล้วคัดลอก URL ไว้

---

## ขั้นตอนที่ 2: ทดสอบบัญชี B ตอนยังไม่ได้กรอกรหัสเชิญ (สิทธิ์ผู้ชมที่ล็อกอิน)

1. ล็อกอินด้วย **บัญชี B** ที่หน้า `/login`
2. สังเกตแถบสถานะสิทธิ์ด้านบน
   * **ผลลัพธ์ที่ต้องได้:** แสดงสิทธิ์เป็น **ผู้ชม (Viewer)** และมีข้อความ `"กรอกรหัสเชิญเพื่อแก้ไข"`
3. เปิดดูหน้า `/schedule`, `/tasks` และ `/chat`
   * **ผลลัพธ์ที่ต้องได้:** มองเห็นตารางเรียน งาน และข้อความแชทของกลุ่มได้ แต่ไม่มีปุ่มเพิ่ม/แก้ไข/ลบ และไม่มีกล่องพิมพ์ข้อความแชท
4. **ทดสอบยิงแก้ไขผ่าน API ตรงๆ (ตรวจว่า RLS บล็อกที่ฐานข้อมูลจริง):**
   * เปิด **Browser DevTools (F12) > Console** ในหน้าต่างของ **บัญชี B** แล้วรันคำสั่งต่อไปนี้ (หรือทดสอบผ่าน SQL Editor โดยจำลอง `auth.uid()` ของบัญชี B):
     ```sql
     -- ทดสอบใน Supabase SQL Editor โดยจำลองสิทธิ์เป็นบัญชี B (แทนที่ <USER_B_UUID> และ <GROUP_UUID>)
     BEGIN;
     SET LOCAL role = 'authenticated';
     SET LOCAL "request.jwt.claims" = '{"sub": "<USER_B_UUID>", "role": "authenticated"}';

     -- 1) พยายามแอบเพิ่มงานในกลุ่มโดยไม่มีรหัสเชิญ (ต้องเกิด Error: new row violates row-level security policy)
     INSERT INTO public.tasks (group_id, title, task_type)
     VALUES ('<GROUP_UUID>', 'แอบเพิ่มงาน', 'homework');

     -- 2) พยายามแอบส่งข้อความแชท (ต้องเกิด Error: new row violates row-level security policy)
     INSERT INTO public.messages (group_id, sender_id, sender_name, content)
     VALUES ('<GROUP_UUID>', '<USER_B_UUID>', 'Hacker', 'แอบส่งแชท');

     -- 3) พยายามแอบดูตารางรหัสเชิญ invite_codes (ต้องได้ 0 แถว)
     SELECT * FROM public.invite_codes;

     ROLLBACK;
     ```
   * **ผลลัพธ์ที่ต้องได้:** ฐานข้อมูลปฏิเสธการ `INSERT` / `UPDATE` / `DELETE` ทั้งหมดด้วย RLS Policy Error และ `SELECT` ตาราง `invite_codes` ได้ผลลัพธ์ว่างเปล่า (`0 rows`)

---

## ขั้นตอนที่ 3: ทดสอบการกรอกรหัสเชิญของบัญชี B (อัปเกรดเป็น Member)

1. ในหน้า `/group` ของ **บัญชี B**:
   * ลองกรอก **รหัสที่ 2 (ที่ถูกยกเลิกแล้ว)**
   * **ผลลัพธ์ที่ต้องได้:** ระบบปฏิเสธและแจ้งว่า `"รหัสเชิญนี้ถูกยกเลิกแล้ว"`
2. กรอก **รหัสที่ 1 (รหัสที่ใช้งานได้, max_uses = 1)**
   * **ผลลัพธ์ที่ต้องได้:** เข้าร่วมกลุ่มสำเร็จ สิทธิ์เปลี่ยนเป็น **ผู้แก้ไข (Member)**
3. ลองนำ **รหัสที่ 1** ไปกรอกซ้ำอีกครั้ง
   * **ผลลัพธ์ที่ต้องได้:** ระบบปฏิเสธและแจ้งว่า `"รหัสเชิญนี้ถูกใช้งานครบจำนวนครั้งที่กำหนดแล้ว"`
4. ทดสอบสิทธิ์ของ **บัญชี B (Member)**:
   * ส่งข้อความและปักหมุดข้อความในหน้า `/chat` -> **ทำได้สำเร็จ**
   * อัปเดตสถานะ (`todo` -> `in_progress` -> `done`) ของงานที่ตนเองเป็นผู้รับผิดชอบ (`assignee_ids`) -> **ทำได้สำเร็จ**
   * ลองยิง API แก้กำหนดส่ง (`due_date`) หรือชื่องานผ่าน SQL / API ตรงๆ:
     ```sql
     BEGIN;
     SET LOCAL role = 'authenticated';
     SET LOCAL "request.jwt.claims" = '{"sub": "<USER_B_UUID>", "role": "authenticated"}';

     -- พยายามแก้กำหนดส่งของงาน (ต้องถูก Trigger บล็อกด้วยข้อความแจ้งเตือนสิทธิ์ระดับสมาชิก)
     UPDATE public.tasks
     SET due_date = now() + interval '30 days'
     WHERE group_id = '<GROUP_UUID>';

     ROLLBACK;
     ```
   * **ผลลัพธ์ที่ต้องได้:** ถูกปฏิเสธด้วยข้อความ Error จาก Trigger ระดับฐานข้อมูล

---

## ขั้นตอนที่ 4: ทดสอบลิงก์แชร์ดูอย่างเดียว (`/share/:token`) สำหรับผู้ใช้ที่ไม่ล็อกอิน (Anon)

1. เปิดหน้าต่างไม่ระบุตัวตน (Incognito) โดย**ไม่ล็อกอิน** แล้วเข้า URL `/share/:token` ที่สร้างไว้ในขั้นตอนที่ 1
   * **ผลลัพธ์ที่ต้องได้:**
     * แสดงชื่อกลุ่ม ตารางเรียน และรายการงานแบบอ่านอย่างเดียว
     * **ไม่มีการแสดงอีเมล** ของสมาชิกคนใดเลยในหน้าเว็บและใน JSON payload ที่ตอบกลับจาก `get_shared_view`
2. ทดสอบให้ผู้ใช้ `anon` ยิงอ่านตารางโดยตรงใน SQL Editor:
   ```sql
   BEGIN;
   SET LOCAL role = 'anon';
   SELECT * FROM public.groups;
   ROLLBACK;
   ```
   * **ผลลัพธ์ที่ต้องได้:** เกิด `permission denied for table groups` (บล็อก 100%)
3. กลับไปที่ **บัญชี A (Owner)** ในหน้า `/group` แล้วกด **ยกเลิกลิงก์แชร์**
4. รีเฟรชหน้า `/share/:token` ในหน้าต่างไม่ระบุตัวตน
   * **ผลลัพธ์ที่ต้องได้:** ไม่สามารถดูข้อมูลได้ และแสดงข้อความว่า `"ลิงก์แชร์ไม่ถูกต้องหรือถูกยกเลิกแล้ว"`

---

## ขั้นตอนที่ 5: ทดสอบรายละเอียดรายวิชา ลิงก์ และความปลอดภัย (รอบ 8: `migration-course-details.sql`)

### 5.1 การรันไฟล์ Migration
1. เปิด **Supabase Dashboard > SQL Editor**
2. คัดลอกโค้ดทั้งหมดจากไฟล์ `supabase/migration-course-details.sql` ไปวางแล้วกด **Run**
   * **ผลลัพธ์ที่ต้องได้:** สร้างฟังก์ชัน `validate_course_links`, เพิ่มคอลัมน์ `color`, `notes`, `location_text`, `links` ใน `courses`, เพิ่มคอลัมน์ `exam_room`, `exam_topics` ใน `tasks`, และอัปเดตฟังก์ชัน `get_shared_view(token)` สำเร็จ

### 5.2 ทดสอบการบล็อกลิงก์อันตราย (`javascript:alert(1)`)
1. **ทดสอบผ่านหน้าเว็บ (UI):**
   * ล็อกอินด้วย **บัญชี A (Owner/Member)** ไปที่หน้า `/schedule` กดที่บล็อกวิชาเพื่อเปิดป็อปอัพ `CourseDialog`
   * กดปุ่ม **แก้ไขรายละเอียดวิชา** แล้วลองเพิ่มลิงก์โดยกรอก URL เป็น `javascript:alert(1)` หรือ `data:text/html,<script>alert(1)</script>` หรือ `http://example.com`
   * **ผลลัพธ์ที่ต้องได้:** ระบบปฏิเสธทันทีและแสดงข้อความแจ้งเตือนภาษาไทยว่าต้องขึ้นต้นด้วย `https://` เท่านั้น
2. **ทดสอบยิงผ่าน SQL / API ตรงๆ (ระดับฐานข้อมูล):**
   ```sql
   BEGIN;
   -- พยายามยัดลิงก์ javascript:alert(1) ลงตาราง courses โดยตรง (ต้องติด CHECK constraint courses_links_valid_check)
   UPDATE public.courses
   SET links = '[{"type":"other","label":"XSS","url":"javascript:alert(1)"}]'::jsonb;
   ROLLBACK;
   ```
   * **ผลลัพธ์ที่ต้องได้:** ฐานข้อมูลปฏิเสธด้วย `ERROR: new row for relation "courses" violates check constraint "courses_links_valid_check"`

### 5.3 ทดสอบผู้ชมที่ล็อกอินแต่ไม่มีรหัสเชิญ (Viewer) พยายามแก้ลิงก์/โน้ตผ่าน API ตรงๆ
1. ล็อกอินด้วย **บัญชี B (ตอนที่ยังไม่ได้กรอกรหัสเชิญเข้ากลุ่ม)**
2. เปิดป็อปอัพรายวิชาในหน้า `/schedule`:
   * **ผลลัพธ์บนหน้าเว็บ:** แสดงป้าย `👁️ โหมดดูอย่างเดียว` และไม่มีปุ่มแก้ไขลิงก์ โน้ต หรือสีวิชา
3. **ทดสอบยิง API ตรงๆ จาก Browser Console หรือ SQL Editor ในนามบัญชี B:**
   ```sql
   BEGIN;
   SET LOCAL role = 'authenticated';
   SET LOCAL "request.jwt.claims" = '{"sub": "<USER_B_UUID>", "role": "authenticated"}';

   -- พยายามแอบแก้ links และ notes ของรายวิชาในกลุ่มที่ตนเองไม่ได้เป็นสมาชิก
   UPDATE public.courses
   SET notes = 'แอบแก้โน้ต',
       links = '[{"type":"other","label":"Hack","url":"https://example.com"}]'::jsonb
   WHERE group_id = '<GROUP_UUID>';

   ROLLBACK;
   ```
   * **ผลลัพธ์ที่ต้องได้:** อัปเดตได้ `0 rows` (ถูกบล็อกด้วย RLS Policy `courses_update_group_members` ซึ่งอนุญาตเฉพาะ `owner`, `admin`, `member` ในกลุ่มนั้น)

### 5.4 ทดสอบลิงก์แชร์ (`/share/:token`) ในหน้าต่างไม่ระบุตัวตน: ต้องไม่มี `links` และ `notes` ส่งมาจากฐานข้อมูล
1. ใช้ **บัญชี A** เพิ่มโน้ตและลิงก์ (`https://meet.google.com/...`) ลงในรายวิชา แล้วสร้างลิงก์แชร์ `/share/:token`
2. เปิดหน้าต่างไม่ระบุตัวตน (Incognito) เข้าไปที่ `/share/:token`:
   * **ผลลัพธ์บนหน้าเว็บ:** ไม่แสดงลิงก์และโน้ตของรายวิชา
3. **ตรวจผ่านการเรียก RPC API ตรงๆ (DevTools > Network หรือ Console):**
   ```js
   // รันใน Browser Console ของหน้าต่างไม่ระบุตัวตน หรือตรวจดู Response ของ RPC get_shared_view
   const { data } = await supabase.rpc('get_shared_view', { token: '<SHARE_TOKEN>' })
   console.log(data.courses)
   ```
   * **ผลลัพธ์ที่ต้องได้:** ในแต่ละออบเจกต์ของ `data.courses` มีเฉพาะ `id`, `course_code`, `course_name`, `credits`, `section`, `instructor`, `online_link`, `color`, `location_text` **โดยไม่มีคีย์ `links` และไม่มีคีย์ `notes` อยู่ใน JSON ที่ส่งกลับมาจากฐานข้อมูลเลย**

## 6. ทดสอบนัดหมาย (migration-appointments.sql)

1. รัน `supabase/migration-appointments.sql` ใน SQL Editor
2. ล็อกอินเป็น member/admin/owner → หน้า /schedule กด `+ เพิ่มนัด` บันทึกสำเร็จ และนัดแสดงในตารางรายสัปดาห์ ปฏิทิน และหน้าวันนี้
3. ล็อกอินเป็นผู้ชม (viewer ไม่มีรหัสเชิญ) → เพิ่ม/แก้ไข/ลบนัดต้องถูกปฏิเสธ (insert ติด RLS, update/delete ไม่มีแถวถูกแก้)
4. member ลบนัดของคนอื่นต้องไม่สำเร็จ แต่ลบนัดที่ตนสร้างได้; owner/admin ลบได้ทุกนัด
5. เปิด `/share/:token` โดยไม่ล็อกอิน → ต้องไม่เห็นนัดหมาย (ตาราง appointments ไม่ได้ GRANT ให้ anon และ get_shared_view ไม่ได้แก้)
