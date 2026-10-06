import Link from "next/link";
export default function NotFound() { return <main className="standalone"><h1>Không tìm thấy trang</h1><p>Trang bạn tìm không tồn tại.</p><Link href="/" className="button button-primary">Về tổng quan</Link></main>; }
