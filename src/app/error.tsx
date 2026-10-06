"use client";
import { ErrorState } from "@/components/ui/common";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="standalone"><ErrorState message="Kiểm tra cấu hình DATABASE_URL và kết nối PostgreSQL, rồi thử lại." retry={reset} /></main>; }
