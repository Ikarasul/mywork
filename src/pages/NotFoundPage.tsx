import { Link } from 'react-router-dom'
import PixelCat from '../components/PixelCat'
import { Button, Card } from '../components/ui'

export function NotFoundPage() {
  return (
    <Card padding="lg" className="mx-auto max-w-lg text-center">
      <div className="flex justify-center">
        <PixelCat mood="confused" size={88} />
      </div>
      <p className="mt-3 font-pixel text-2xl text-primary">404</p>
      <h1 className="mt-1 text-xl font-bold text-ink">
        เหมียว? ไม่พบหน้าที่คุณต้องการ
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        ลิงก์ที่คุณเปิดอาจถูกย้ายหรือพิมพ์ที่อยู่ไม่ถูกต้อง ลองกลับไปที่หน้าวันนี้หรือตารางเรียนดูนะครับ
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/today">
          <Button variant="primary">กลับหน้าวันนี้ (/today)</Button>
        </Link>
        <Link to="/schedule">
          <Button variant="outline">ดูตารางเรียน (/schedule)</Button>
        </Link>
      </div>
    </Card>
  )
}

export default NotFoundPage
