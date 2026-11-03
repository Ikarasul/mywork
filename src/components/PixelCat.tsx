export type PixelCatMood = 'idle' | 'sleep' | 'happy' | 'confused'
export type PixelRavenMood = PixelCatMood

export interface PixelCatProps {
  mood?: PixelCatMood
  size?: number
  className?: string
  label?: string
}

export type PixelRavenProps = PixelCatProps

const MOOD_ARIA_LABELS: Record<PixelRavenMood, string> = {
  idle: 'มาสคอตนกอีกาพิกเซล ยืนเกาะอย่างชาญฉลาด',
  sleep: 'มาสคอตนกอีกาพิกเซล กำลังซุกปีกนอนหลับพักผ่อน',
  happy: 'มาสคอตนกอีกาพิกเซล กำลังกระพือปีกอย่างร่าเริง',
  confused: 'มาสคอตนกอีกาพิกเซล กำลังเอียงคอสงสัย',
}

export function PixelRaven({
  mood = 'idle',
  size = 48,
  className = '',
  label,
}: PixelRavenProps) {
  const ariaLabel = label ?? MOOD_ARIA_LABELS[mood]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      role="img"
      aria-label={ariaLabel}
      className={`inline-block select-none ${className}`}
    >
      {/* หางอีกาด้านหลัง */}
      <g className="pixel-cat-tail-anim">
        <rect x="1" y="11" width="3" height="2" fill="#1e1b4b" />
        <rect x="2" y="12" width="3" height="2" fill="#0f172a" />
        <rect x="0" y="12" width="2" height="1" fill="#020617" />
      </g>

      {/* ลำตัวและปีกอีกาพิกเซล */}
      <g className="pixel-cat-body-anim">
        {/* ขนหงอนด้านบนหัว */}
        <rect x="7" y="1" width="2" height="1" fill="#0f172a" />
        <rect x="6" y="2" width="4" height="1" fill="#1e1b4b" />
        <rect x="5" y="2" width="1" height="1" fill="#312e81" />

        {/* ส่วนหัวอีกา */}
        <rect x="5" y="3" width="6" height="4" fill="#0f172a" />
        <rect x="6" y="3" width="4" height="2" fill="#1e1b4b" />

        {/* จะงอยปากสีทอง/ส้มเด่นชัดของนกอีกา */}
        <rect x="11" y="5" width="3" height="1" fill="#f59e0b" />
        <rect x="11" y="6" width="2" height="1" fill="#d97706" />
        <rect x="13" y="6" width="1" height="1" fill="#b45309" />

        {/* ดวงตาของอีกาตามอารมณ์ */}
        {mood === 'idle' && (
          <g className="pixel-cat-eye-anim">
            <rect x="8" y="4" width="2" height="2" fill="#38bdf8" />
            <rect x="9" y="4" width="1" height="1" fill="#ffffff" />
          </g>
        )}

        {mood === 'sleep' && (
          <g>
            {/* ตาหลับเป็นเส้นขีด */}
            <rect x="8" y="5" width="2" height="1" fill="#38bdf8" />
            {/* ตัว Z พิกเซลลอยขึ้น */}
            <rect x="12" y="1" width="2" height="1" fill="#818cf8" />
            <rect x="13" y="2" width="1" height="1" fill="#818cf8" />
            <rect x="12" y="3" width="2" height="1" fill="#818cf8" />
          </g>
        )}

        {mood === 'happy' && (
          <g>
            {/* ตายิ้มรูปโค้ง ^ */}
            <rect x="8" y="4" width="1" height="1" fill="#38bdf8" />
            <rect x="9" y="3" width="1" height="1" fill="#38bdf8" />
            {/* หัวใจพิกเซลลอย */}
            <rect x="12" y="1" width="1" height="1" fill="#ec4899" />
            <rect x="14" y="1" width="1" height="1" fill="#ec4899" />
            <rect x="12" y="2" width="3" height="1" fill="#ec4899" />
            <rect x="13" y="3" width="1" height="1" fill="#ec4899" />
          </g>
        )}

        {mood === 'confused' && (
          <g>
            {/* ตาโตข้างเดียว */}
            <rect x="8" y="4" width="2" height="2" fill="#38bdf8" />
            <rect x="8" y="4" width="1" height="1" fill="#ffffff" />
            {/* เครื่องหมายคำถาม (?) พิกเซลสีทอง */}
            <rect x="12" y="1" width="2" height="1" fill="#fbbf24" />
            <rect x="14" y="2" width="1" height="1" fill="#fbbf24" />
            <rect x="13" y="3" width="1" height="1" fill="#fbbf24" />
            <rect x="13" y="5" width="1" height="1" fill="#fbbf24" />
          </g>
        )}

        {/* ลำตัวและปีก (ขนสีน้ำเงินเข้ม ดำขลับ เหลือบม่วง) */}
        <rect x="4" y="7" width="7" height="5" fill="#0f172a" />
        <rect x="5" y="7" width="5" height="4" fill="#1e1b4b" />
        {/* ลายขนปีกพับด้านข้าง */}
        <rect x="3" y="8" width="4" height="4" fill="#312e81" />
        <rect x="2" y="9" width="3" height="3" fill="#1e1b4b" />
        <rect x="4" y="10" width="3" height="2" fill="#4338ca" />

        {/* ขาและกรงเล็บอีกาสีทองเกาะกิ่ง */}
        <rect x="5" y="12" width="1" height="2" fill="#f59e0b" />
        <rect x="8" y="12" width="1" height="2" fill="#f59e0b" />
        <rect x="4" y="14" width="3" height="1" fill="#d97706" />
        <rect x="7" y="14" width="3" height="1" fill="#d97706" />

        {/* กิ่งไม้/คอนรองเกาะ */}
        <rect x="2" y="15" width="12" height="1" fill="#78350f" opacity="0.85" />
      </g>
    </svg>
  )
}

// Export ทั้ง PixelRaven และ PixelCat เพื่อให้คอมโพเนนต์อื่น ๆ เรียกใช้ได้ทันที
export const PixelCat = PixelRaven
export default PixelRaven
