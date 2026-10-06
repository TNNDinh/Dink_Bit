"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, BookOpen, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, SubmitButton } from "@/components/ui/common";
import { api } from "@/lib/client";
export function AuthForm({ mode, google = false, token = "" }: { mode: "login" | "register" | "forgot" | "reset"; google?: boolean; token?: string }) {
  const router = useRouter(), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [visible, setVisible] = useState(false);
  const titles = { login: "Chào mừng trở lại", register: "Bắt đầu ghi chép rõ ràng", forgot: "Quên mật khẩu?", reset: "Đặt mật khẩu mới" };
  return <div className="auth-layout"><aside className="auth-brand"><Link href="/login" className="logo"><span><BookOpen size={24} /></span><div>DinkBit<small>SỔ CÔNG NỢ CÁ NHÂN</small></div></Link><div className="auth-pitch"><span className="auth-eyebrow">MỘT CUỐN SỔ. NHIỀU AN TÂM.</span><h1>Công nợ rõ ràng.<br />Cuộc sống<br /><em>nhẹ nhàng hơn.</em></h1><p>Không cần nhớ ai nợ ai.<br />Để DinkBit ghi nhớ giúp bạn.</p><div className="auth-benefits">{["Mọi khoản thu, trả trong một nơi", "Ghi nhận thanh toán chỉ vài thao tác", "Nhắc đúng lúc, không bỏ sót hạn"].map((label) => <span key={label}><Check size={17} />{label}</span>)}</div></div><span className="auth-brand-footer"><ShieldCheck size={18} />Dữ liệu riêng của bạn. Chỉ bạn mới thấy.</span></aside><main className="auth-main"><div className="auth-top-link">{mode === "login" ? <>Chưa có tài khoản? <Link href="/register">Đăng ký ngay <ArrowRight size={14} /></Link></> : <Link href="/login">Đã có tài khoản? Đăng nhập <ArrowRight size={14} /></Link>}</div><div className="auth-form-container"><div className="auth-mobile-logo"><BookOpen size={22} />DinkBit</div><h2>{titles[mode]}{mode === "login" && <span> 👋</span>}</h2><p>{mode === "login" ? "Đăng nhập để tiếp tục quản lý công nợ của bạn." : mode === "register" ? "Tạo không gian riêng cho những khoản công nợ của bạn." : mode === "forgot" ? "Nhập email để nhận liên kết đặt lại mật khẩu." : "Chọn mật khẩu mạnh gồm ít nhất 10 ký tự."}</p><form className="form-stack" onSubmit={async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    const data = new FormData(event.currentTarget), email = String(data.get("email") || "").trim(), password = String(data.get("password") || "");
    if ((mode === "register" || mode === "reset") && password !== data.get("confirmPassword")) { setError("Mật khẩu xác nhận không khớp."); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        const result = await signIn("credentials", { email, password, remember: data.get("remember") === "on" ? "true" : "false", redirect: false });
        if (result?.error) throw new Error("Email hoặc mật khẩu chưa đúng, hoặc bạn đăng nhập quá nhiều lần.");
        router.push("/"); router.refresh();
      } else {
        const result = await api<{ message?: string }>("/api/account", { method: "POST", body: JSON.stringify({ action: mode, data: mode === "register" ? { name: data.get("name"), email, password } : mode === "forgot" ? { email } : { token, password } }) });
        if (mode === "register") router.push("/login?registered=1");
        else setMessage(result.message || "Đã đặt lại mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.");
      }
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }}>
    {mode === "register" && <Field label="Họ và tên" htmlFor="auth-name"><input id="auth-name" name="name" autoComplete="name" placeholder="Nguyễn Minh Anh" required maxLength={100} /></Field>}
    {mode !== "reset" && <Field label="Email" htmlFor="auth-email"><input id="auth-email" name="email" type="email" autoComplete="email" placeholder="ban@example.com" required /></Field>}
    {mode !== "forgot" && <Field label="Mật khẩu" htmlFor="auth-password"><div className="password-input"><input id="auth-password" name="password" type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Nhập mật khẩu" : "Ít nhất 10 ký tự"} minLength={mode === "login" ? 1 : 10} maxLength={128} required /><button type="button" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>}
    {(mode === "register" || mode === "reset") && <Field label="Xác nhận mật khẩu" htmlFor="auth-confirm"><input id="auth-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></Field>}
    {mode === "login" && <div className="auth-options"><label><input type="checkbox" name="remember" />Ghi nhớ 7 ngày</label><Link href="/forgot-password">Quên mật khẩu?</Link></div>}
    {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}
    <SubmitButton loading={busy}>{mode === "login" ? "Đăng nhập" : mode === "register" ? "Tạo tài khoản" : mode === "forgot" ? "Gửi liên kết khôi phục" : "Lưu mật khẩu mới"}<ArrowRight size={17} /></SubmitButton>
  </form>{(mode === "login" || mode === "register") && <><div className="auth-divider"><span>hoặc tiếp tục với</span></div><Button className="google-button" variant="secondary" disabled={!google || busy} onClick={() => signIn("google", { callbackUrl: "/" })}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.7 2.9-4.3 2.9-7.6Z" /><path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.5-2.3l-3.3-2.6c-.9.6-2 .9-3.2.9-2.6 0-4.9-1.8-5.7-4.2H2.9v2.7A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.3 13.8a6 6 0 0 1 0-3.6V7.5H2.9a10 10 0 0 0 0 9l3.4-2.7Z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.5l3.4 2.7A6 6 0 0 1 12 6Z" /></svg>Google{!google && " (chưa cấu hình)"}</Button></>}<p className="auth-footnote">Công nợ rõ ràng, an tâm mỗi ngày.<br />DinkBit · Tiếng Việt · VND</p></div></main></div>;
}
