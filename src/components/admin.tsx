"use client";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/components/dashboard";
import { Avatar, ErrorState, Field, LoadingSkeleton, Pagination, SubmitButton } from "@/components/ui/common";
import { api, useResource } from "@/lib/client";
import type { PageData } from "@/lib/types";
import { registrationSchema } from "@/lib/validation";

type Account = { id: string; name: string | null; email: string; role: "USER" | "ADMIN"; createdAt: string };
type AccountInput = z.infer<typeof registrationSchema>;

export function Admin() {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [error, setError] = useState("");
  const accounts = useResource<PageData<Account>>(`/api/admin?page=${page}`, revision);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<AccountInput>({ resolver: zodResolver(registrationSchema), defaultValues: { name: "", email: "", password: "" } });
  const createAccount = handleSubmit(async (input) => {
    setError("");
    try {
      await api<Account>("/api/admin", { method: "POST", body: JSON.stringify(input) });
      reset(); setPage(1); setRevision((value) => value + 1);
      toast.success("Đã tạo tài khoản. Người dùng có thể đăng nhập ngay.");
    } catch (failure) { setError((failure as Error).message); }
  });

  return <>
    <PageHeading title="Quản trị tài khoản" description="Tạo tài khoản và quản lý danh sách người dùng DinkBit." />
    <div className="info-banner"><ShieldCheck size={19} /><span>Quản trị viên chỉ quản lý tài khoản. Công nợ, người liên hệ và giao dịch vẫn riêng tư với từng người dùng.</span></div>
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Thêm tài khoản</h2><p>Tài khoản mới có quyền người dùng thông thường</p></div><UserPlus size={21} /></div>
        <form className="form-stack" onSubmit={createAccount} noValidate>
          <Field label="Họ và tên" htmlFor="admin-name" error={errors.name?.message}><input id="admin-name" autoComplete="name" maxLength={100} {...register("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "admin-name-error" : undefined} /></Field>
          <Field label="Email" htmlFor="admin-email" error={errors.email?.message}><input id="admin-email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "admin-email-error" : undefined} /></Field>
          <Field label="Mật khẩu" htmlFor="admin-password" error={errors.password?.message}><input id="admin-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} placeholder="Ít nhất 10 ký tự" {...register("password")} aria-invalid={!!errors.password} aria-describedby={errors.password ? "admin-password-error" : undefined} /></Field>
          <p className="muted">Gửi thông tin đăng nhập cho người dùng qua kênh riêng. Mật khẩu không hiển thị trong danh sách và không được lưu dạng rõ trong database.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <SubmitButton loading={isSubmitting}><UserPlus size={16} />Tạo tài khoản</SubmitButton>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Danh sách tài khoản</h2><p>{accounts.data ? `${accounts.data.count} tài khoản` : "Đang tải danh sách"}</p></div></div>
        {accounts.loading ? <LoadingSkeleton /> : accounts.error ? <ErrorState message={accounts.error} retry={accounts.reload} /> : accounts.data && <>
          <div className="notification-list admin-accounts">{accounts.data.items.map((account) => <article key={account.id} className="notice-item">
            <Avatar name={account.name || account.email} />
            <div><strong>{account.name || "Chưa đặt tên"}</strong><p>{account.email}</p><small>{account.role === "ADMIN" ? "Quản trị viên" : "Người dùng"} · {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(account.createdAt))}</small></div>
          </article>)}</div>
          <Pagination count={accounts.data.count} page={page} pageSize={accounts.data.pageSize} onChange={setPage} />
        </>}
      </section>
    </div>
  </>;
}
