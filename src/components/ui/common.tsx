"use client";
import { useState } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";
import { statuses, type DebtStatus } from "@/lib/domain";
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const colors = ["blue", "purple", "green", "orange"];
  const index = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length;
  return <span className={cn("avatar", `avatar-${colors[index]}`, large && "avatar-large")}>{initials(name)}</span>;
}
export function Badge({ status }: { status: DebtStatus }) { return <span className={cn("badge", `badge-${status.toLowerCase()}`)}><span />{statuses[status]}</span>; }
export function Direction({ type }: { type: string }) { return <span className={cn("direction", type === "RECEIVABLE" ? "positive" : "negative")}>{type === "RECEIVABLE" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{type === "RECEIVABLE" ? "Họ nợ tôi" : "Tôi nợ họ"}</span>; }
export function EmptyState({ title = "Chưa có công nợ nào", description = "Thêm khoản công nợ đầu tiên để bắt đầu quản lý.", action }: { title?: string; description?: string; action?: React.ReactNode }) { return <div className="empty-state"><span><Inbox size={28} /></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function LoadingSkeleton() { return <div className="loading-grid" role="status" aria-label="Đang tải dữ liệu">{[0, 1, 2, 3].map((index) => <div key={index} className="skeleton" />)}<div className="skeleton skeleton-wide" /></div>; }
export function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="error-state" role="alert"><AlertCircle size={24} /><h3>Chưa thể tải dữ liệu</h3><p>{message}</p><Button onClick={retry} variant="secondary">Thử lại</Button></div>; }
export function Field({ label, error, htmlFor, children }: { label: string; error?: string; htmlFor: string; children: React.ReactNode }) { return <div className="field"><label htmlFor={htmlFor}>{label}</label>{children}{error && <small id={`${htmlFor}-error`} className="field-error" role="alert">{error}</small>}</div>; }
export function CurrencyInput({ id, value, onChange, invalid, describedBy }: { id: string; value: number; onChange: (value: number) => void; invalid?: boolean; describedBy?: string }) {
  const [editing, setEditing] = useState(false), [inputError, setInputError] = useState(false);
  const message = "Chỉ nhập số nguyên VND, không nhập dấu trừ hoặc phần thập phân.";
  const display = value ? editing ? String(value) : new Intl.NumberFormat("vi-VN").format(value) : "";
  return <><div className="currency-input"><input id={id} inputMode="numeric" autoComplete="off" maxLength={18} aria-invalid={invalid || inputError} aria-describedby={[describedBy, inputError ? `${id}-currency-error` : ""].filter(Boolean).join(" ")} placeholder="0" value={display} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={(event) => {
    const raw = event.target.value.replace(/[₫\s]/g, "");
    const digits = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw) ? raw.replace(/[.,]/g, "") : raw;
    if (!/^\d*$/.test(digits)) { setInputError(true); event.target.setCustomValidity(message); return; }
    setInputError(false); event.target.setCustomValidity(""); onChange(Number(digits));
  }} /><span>₫</span></div>{inputError && <small id={`${id}-currency-error`} role="alert" className="field-error">{message}</small>}</>;
}
export function Pagination({ count, page, pageSize, onChange }: { count: number; page: number; pageSize: number; onChange: (page: number) => void }) { const pages = Math.max(1, Math.ceil(count / pageSize)); return <div className="pagination"><span>{count ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)}` : "0"} / {count} kết quả</span><div><Button variant="secondary" size="icon" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></Button><span>{page} / {pages}</span><Button variant="secondary" size="icon" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau"><ChevronRight size={16} /></Button></div></div>; }
export function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) { return <Button type="submit" disabled={loading}>{loading && <LoaderCircle size={16} className="spin" />}{children}</Button>; }
