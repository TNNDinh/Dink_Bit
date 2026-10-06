import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
export const metadata: Metadata = { title: "DinkBit — Công nợ rõ ràng, cuộc sống nhẹ nhàng", description: "Quản lý công nợ cá nhân, ghi nhận thanh toán và theo dõi số dư bằng VND." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('debtbook-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch{}" }} /></head><body>{children}<Toaster richColors position="bottom-right" closeButton /></body></html>;
}
