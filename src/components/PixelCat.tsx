export type PixelCatMood = 'idle' | 'sleep' | 'happy' | 'confused'

export interface PixelCatProps {
  mood?: PixelCatMood
  size?: number
  className?: string
  label?: string
}

const MOOD_ARIA_LABELS: Record<PixelCatMood, string> = {
  idle: 'มาสคอตแมวพิกเซลกำลังนั่งมองตาแป๋ว',
  sleep: 'มาสคอตแมวพิกเซลกำลังนอนหลับปุ๋ย',
  happy: 'มาสคอตแมวพิกเซลกำลังยิ้มอย่างมีความสุข',
  confused: 'มาสคอตแมวพิกเซลกำลังงุนงงสงสัย',
}

export function PixelCat({
  mood = 'idle',
  size = 48,
  className = '',
  label,
}: PixelCatProps) {
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
      {/* หางพิกเซลกระดิกได้ */}
      <g className="pixel-cat-tail-anim">
        <rect x="13" y="10" width="1" height="3" fill="var(--color-cat-fur-dark)" />
        <rect x="14" y="8" width="1" height="3" fill="var(--color-cat-fur)" />
        <rect x="14" y="7" width="1" height="1" fill="var(--color-cat-outline)" />
      </g>

      {/* ลำตัวและหัวของแมวพิกเซลต้นฉบับ */}
      <g className="pixel-cat-body-anim">
        {/* หูซ้ายและขวา */}
        <rect x="3" y="2" width="2" height="1" fill="var(--color-cat-outline)" />
        <rect x="10" y="2" width="2" height="1" fill="var(--color-cat-outline)" />
        <rect x="2" y="3" width="1" height="2" fill="var(--color-cat-outline)" />
        <rect x="12" y="3" width="1" height="2" fill="var(--color-cat-outline)" />
        <rect x="3" y="3" width="1" height="1" fill="var(--color-cat-ear)" />
        <rect x="4" y="3" width="1" height="1" fill="var(--color-cat-fur)" />
        <rect x="10" y="3" width="1" height="1" fill="var(--color-cat-fur)" />
        <rect x="11" y="3" width="1" height="1" fill="var(--color-cat-ear)" />

        {/* ขอบหัวด้านบน */}
        <rect x="5" y="3" width="5" height="1" fill="var(--color-cat-outline)" />

        {/* ใบหน้าแมว */}
        <rect x="2" y="5" width="1" height="5" fill="var(--color-cat-outline)" />
        <rect x="12" y="5" width="1" height="5" fill="var(--color-cat-outline)" />
        <rect x="3" y="4" width="9" height="6" fill="var(--color-cat-fur)" />

        {/* ลายหน้าผากเสือส้มต้นฉบับ */}
        <rect x="7" y="4" width="1" height="2" fill="var(--color-cat-fur-dark)" />
        <rect x="5" y="4" width="1" height="1" fill="var(--color-cat-fur-dark)" />
        <rect x="9" y="4" width="1" height="1" fill="var(--color-cat-fur-dark)" />

        {/* แก้มชมพู */}
        <rect x="3" y="7" width="1" height="1" fill="var(--color-cat-ear)" />
        <rect x="11" y="7" width="1" height="1" fill="var(--color-cat-ear)" />

        {/* จมูกและปาก */}
        <rect x="7" y="7" width="1" height="1" fill="var(--color-accent-pink)" />
        <rect x="6" y="8" width="3" height="1" fill="var(--color-cat-belly)" />

        {/* ดวงตาตามอารมณ์ (mood) */}
        {mood === 'idle' && (
          <g className="pixel-cat-eye-anim">
            <rect x="4" y="6" width="2" height="2" fill="var(--color-cat-eye)" />
            <rect x="9" y="6" width="2" height="2" fill="var(--color-cat-eye)" />
            <rect x="4" y="6" width="1" height="1" fill="var(--color-cat-belly)" />
            <rect x="9" y="6" width="1" height="1" fill="var(--color-cat-belly)" />
          </g>
        )}

        {mood === 'sleep' && (
          <g>
            {/* ตาหลับเป็นขีดโค้ง */}
            <rect x="4" y="7" width="2" height="1" fill="var(--color-cat-eye)" />
            <rect x="9" y="7" width="2" height="1" fill="var(--color-cat-eye)" />
            {/* ตัว Z พิกเซลด้านบน */}
            <rect x="13" y="1" width="2" height="1" fill="var(--color-primary)" />
            <rect x="14" y="2" width="1" height="1" fill="var(--color-primary)" />
            <rect x="13" y="3" width="2" height="1" fill="var(--color-primary)" />
          </g>
        )}

        {mood === 'happy' && (
          <g>
            {/* ตายิ้มโค้ง ^ ^ */}
            <rect x="4" y="6" width="1" height="1" fill="var(--color-cat-eye)" />
            <rect x="5" y="5" width="1" height="1" fill="var(--color-cat-eye)" />
            <rect x="9" y="5" width="1" height="1" fill="var(--color-cat-eye)" />
            <rect x="10" y="6" width="1" height="1" fill="var(--color-cat-eye)" />
            {/* หัวใจพิกเซลเล็กๆ ด้านบน */}
            <rect x="13" y="2" width="1" height="1" fill="var(--color-accent-pink)" />
            <rect x="15" y="2" width="1" height="1" fill="var(--color-accent-pink)" />
            <rect x="13" y="3" width="3" height="1" fill="var(--color-accent-pink)" />
            <rect x="14" y="4" width="1" height="1" fill="var(--color-accent-pink)" />
          </g>
        )}

        {mood === 'confused' && (
          <g>
            {/* ตาข้างหนึ่งโต ข้างหนึ่งหรี่ พร้อมเครื่องหมาย ? */}
            <rect x="4" y="6" width="2" height="2" fill="var(--color-cat-eye)" />
            <rect x="9" y="7" width="2" height="1" fill="var(--color-cat-eye)" />
            {/* เครื่องหมายคำถามพิกเซล */}
            <rect x="13" y="1" width="2" height="1" fill="var(--color-accent-amber)" />
            <rect x="15" y="2" width="1" height="1" fill="var(--color-accent-amber)" />
            <rect x="14" y="3" width="1" height="1" fill="var(--color-accent-amber)" />
            <rect x="14" y="5" width="1" height="1" fill="var(--color-accent-amber)" />
          </g>
        )}

        {/* ปลอกคอและกระดิ่ง */}
        <rect x="4" y="10" width="7" height="1" fill="var(--color-cat-collar)" />
        <rect x="7" y="10" width="1" height="2" fill="var(--color-cat-bell)" />

        {/* ลำตัวและพุง */}
        <rect x="3" y="11" width="1" height="3" fill="var(--color-cat-outline)" />
        <rect x="11" y="11" width="1" height="3" fill="var(--color-cat-outline)" />
        <rect x="4" y="11" width="7" height="3" fill="var(--color-cat-fur)" />
        <rect x="6" y="11" width="3" height="3" fill="var(--color-cat-belly)" />

        {/* อุ้งเท้าหน้า */}
        <rect x="4" y="14" width="2" height="1" fill="var(--color-cat-belly)" />
        <rect x="9" y="14" width="2" height="1" fill="var(--color-cat-belly)" />
        <rect x="3" y="14" width="9" height="1" fill="var(--color-cat-outline)" opacity="0.25" />
      </g>
    </svg>
  )
}

export default PixelCat
