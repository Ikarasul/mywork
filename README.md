# ระบบจัดตารางชีวิตและการเรียน (Life & Study Planner)

เว็บแอปพลิเคชันสำหรับจัดการตารางชีวิต ตารางเรียน งาน/การบ้าน/สอบ และแชทกลุ่มแบบเรียลไทม์ พร้อมระบบกลุ่มเรียน รหัสเชิญแบบเข้ารหัส SHA-256 และลิงก์แชร์ดูอย่างเดียว ควบคุมสิทธิ์ระดับฐานข้อมูลด้วย Supabase Row Level Security (RLS)

## เทคโนโลยีที่ใช้
- React + TypeScript + Vite
- Tailwind CSS
- React Router
- Supabase (`@supabase/supabase-js` - Auth Magic Link, Postgres RLS, Realtime)

## วิธีติดตั้งและรันโปรเจกต์

1. ติดตั้งไลบรารีที่จำเป็น:
   ```bash
   npm install
   ```

2. ตั้งค่าฐานข้อมูล Supabase (สำหรับโหมดออนไลน์):
   - สร้างโปรเจกต์บน Supabase แล้วนำโค้ดในไฟล์ `supabase/schema.sql` ไปรันใน **SQL Editor**
   - สร้างไฟล์ `.env.local` ที่โฟลเดอร์รากของโปรเจกต์ แล้วใส่ค่าต่อไปนี้ (ใช้เฉพาะ `anon` public key เท่านั้น ห้ามใช้ `service_role` key):
     ```env
     VITE_SUPABASE_URL=https://your-project-id.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-public-key
     ```
   - *(หากยังไม่ตั้งค่า `.env.local` แอปจะยังเปิดใช้งานได้ในโหมด `localStorage` พร้อมแสดงคำแนะนำการตั้งค่า)*

3. รันเซิร์ฟเวอร์สำหรับพัฒนา (Development Server):
   ```bash
   npm run dev
   ```

4. สร้างไฟล์สำหรับใช้งานจริง (Production Build):
   ```bash
   npm run build
   ```
