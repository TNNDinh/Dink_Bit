"use client";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDownLeft, ArrowUpRight, Plus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CurrencyInput, Field, SubmitButton } from "@/components/ui/common";
import { api, mutate, useDebounce, useResource } from "@/lib/client";
import { contactSchema, debtSchema, paymentSchema } from "@/lib/validation";
import { localDate, money, cn } from "@/lib/utils";
import { methods } from "@/lib/domain";
import type { Contact, Debt, PageData } from "@/lib/types";

type FormProps = { onClose: () => void; onDone: () => void };
export function AddDebtModal({ onClose, onDone, debt, contact, initialType = "RECEIVABLE" }: FormProps & { debt?: Debt; contact?: Contact; initialType?: "RECEIVABLE" | "PAYABLE" }) {
  const [search, setSearch] = useState(""), debounced = useDebounce(search);
  const contacts = useResource<PageData<Contact>>(`/api/book?resource=contact-options&q=${encodeURIComponent(debounced)}`);
  const [newName, setNewName] = useState(""), [addingContact, setAddingContact] = useState(false), [newContact, setNewContact] = useState<Contact>();
  const [file, setFile] = useState<File>(), [error, setError] = useState("");
  const form = useForm<z.input<typeof debtSchema>, unknown, z.output<typeof debtSchema>>({ resolver: zodResolver(debtSchema), defaultValues: { contactId: debt?.contactId || contact?.id || "", type: debt?.type || initialType, totalAmount: debt?.totalAmount || 0, title: debt?.title || "", description: debt?.description || "", createdDate: debt?.createdDate.slice(0, 10) || localDate(), dueDate: debt?.dueDate?.slice(0, 10) || "", note: debt?.note || "" } });
  const errors = form.formState.errors, busy = form.formState.isSubmitting;
  const selectedType = useWatch({ control: form.control, name: "type" });
  const selectedContactId = useWatch({ control: form.control, name: "contactId" });
  const createdDate = useWatch({ control: form.control, name: "createdDate" });
  const items = [...(contacts.data?.items || [])];
  for (const item of [newContact, contact, debt?.contact]) if (item && !items.some((existing) => existing.id === item.id)) items.push(item as Contact);
  async function addContact() {
    if (!newName.trim()) return;
    setAddingContact(true);
    try { const created = await mutate<Contact>("contact.create", { name: newName.trim() }); setNewContact(created); form.setValue("contactId", created.id, { shouldValidate: true }); setNewName(""); toast.success("Đã thêm người liên hệ"); }
    catch (failure) { toast.error((failure as Error).message); } finally { setAddingContact(false); }
  }
  return <Dialog open onClose={() => { if (!busy && !addingContact) onClose(); }} title={debt ? "Chỉnh sửa công nợ" : "Thêm công nợ"} description="Chỉ vài thông tin để không bỏ sót một khoản tiền nào."><form onSubmit={form.handleSubmit(async (values) => {
    setError("");
    try {
      const saved = await mutate<Debt>(debt ? "debt.update" : "debt.create", { ...values, ...(debt ? { id: debt.id } : {}) });
      if (file) {
        const data = new FormData(); data.set("file", file); data.set("debtId", saved.id);
        try { await api("/api/attachments", { method: "POST", body: data }); } catch (failure) { toast.warning(`Công nợ đã lưu, tệp chưa được lưu: ${(failure as Error).message}`); }
      }
      toast.success(debt ? "Đã cập nhật công nợ" : "Đã thêm công nợ thành công"); onDone();
    } catch (failure) { setError((failure as Error).message); }
  })} className="form-stack">
    <div className="type-selector">{(["RECEIVABLE", "PAYABLE"] as const).map((type) => <button key={type} type="button" className={cn(selectedType === type && "selected", type === "RECEIVABLE" ? "positive" : "negative")} onClick={() => form.setValue("type", type)} aria-pressed={selectedType === type}>{type === "RECEIVABLE" ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}{type === "RECEIVABLE" ? "Họ nợ tôi" : "Tôi nợ họ"}</button>)}</div>
    <Field label="Người liên hệ *" htmlFor="debt-contact" error={errors.contactId?.message}><input aria-label="Tìm người liên hệ" placeholder="Tìm người liên hệ…" value={search} onChange={(event) => setSearch(event.target.value)} /><select id="debt-contact" {...form.register("contactId")} value={selectedContactId} onChange={(event) => { void form.register("contactId").onChange(event); setNewContact(items.find((item) => item.id === event.target.value)); }} aria-invalid={!!errors.contactId} aria-describedby="debt-contact-error"><option value="">{contacts.loading ? "Đang tải người liên hệ…" : "Chọn người liên hệ"}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{contacts.error && <small className="field-error">{contacts.error}</small>}<div className="inline-add"><input aria-label="Tên người liên hệ mới" value={newName} placeholder="Hoặc nhập tên người mới…" maxLength={100} onChange={(event) => setNewName(event.target.value)} /><Button type="button" variant="secondary" disabled={!newName.trim() || addingContact} onClick={addContact}><Plus size={16} />Thêm</Button></div></Field>
    <Field label="Số tiền *" htmlFor="debt-amount" error={errors.totalAmount?.message}><Controller name="totalAmount" control={form.control} render={({ field }) => <CurrencyInput id="debt-amount" value={field.value} onChange={field.onChange} invalid={!!errors.totalAmount} describedBy="debt-amount-error" />} /></Field>
    <Field label="Nội dung" htmlFor="debt-title" error={errors.title?.message}><input id="debt-title" placeholder="Ví dụ: Tiền ăn tối, mua hàng, vay tiền…" maxLength={200} {...form.register("title")} /></Field>
    <div className="form-grid"><Field label="Ngày tạo *" htmlFor="debt-created" error={errors.createdDate?.message}><input type="date" id="debt-created" max={localDate()} {...form.register("createdDate")} /></Field><Field label="Hạn thanh toán" htmlFor="debt-due" error={errors.dueDate?.message}><input type="date" id="debt-due" min={createdDate} {...form.register("dueDate")} /></Field></div>
    <details className="form-details"><summary>Ghi chú và đính kèm <Paperclip size={14} /></summary><Field label="Mô tả" htmlFor="debt-description"><textarea id="debt-description" rows={2} maxLength={2000} {...form.register("description")} /></Field><Field label="Ghi chú" htmlFor="debt-note"><textarea id="debt-note" rows={2} maxLength={2000} {...form.register("note")} /></Field><Field label="Ảnh hoặc PDF (tối đa 5 MB)" htmlFor="debt-file"><input id="debt-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const selected = event.target.files?.[0]; if (selected && selected.size > 5 * 1024 * 1024) { toast.error("Tệp tối đa 5 MB."); event.target.value = ""; setFile(undefined); } else setFile(selected); }} /></Field></details>
    {error && <div className="form-error" role="alert">{error}</div>}<div className="form-footer"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button><SubmitButton loading={busy}>{debt ? "Lưu thay đổi" : "Lưu công nợ"}</SubmitButton></div>
  </form></Dialog>;
}
export function PaymentModal({ debt, onClose, onDone }: FormProps & { debt: Debt }) {
  const [error, setError] = useState("");
  const form = useForm<z.input<typeof paymentSchema>, unknown, z.output<typeof paymentSchema>>({ resolver: zodResolver(paymentSchema), defaultValues: { debtId: debt.id, amount: debt.remainingAmount, transactionDate: localDate(), paymentMethod: "BANK_TRANSFER", note: "", requestId: crypto.randomUUID() } });
  const errors = form.formState.errors, busy = form.formState.isSubmitting;
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title="Ghi nhận thanh toán" description={`${debt.contact.name} · ${debt.title}`}><div className="payment-balance"><span>Công nợ còn lại</span><strong>{money(debt.remainingAmount)}</strong></div><form className="form-stack" onSubmit={form.handleSubmit(async (values) => {
    setError("");
    if (values.amount > debt.remainingAmount) { form.setError("amount", { message: "Số tiền vượt quá công nợ còn lại." }); return; }
    try { await mutate("payment.create", values); toast.success("Đã ghi nhận thanh toán"); onDone(); } catch (failure) { setError((failure as Error).message); }
  })}><Field htmlFor="payment-amount" label="Số tiền thanh toán *" error={errors.amount?.message}><Controller name="amount" control={form.control} render={({ field }) => <CurrencyInput id="payment-amount" value={field.value} onChange={field.onChange} invalid={!!errors.amount} describedBy="payment-amount-error" />} /></Field><div className="form-grid"><Field label="Ngày thanh toán *" htmlFor="payment-date" error={errors.transactionDate?.message}><input id="payment-date" type="date" min={debt.createdDate.slice(0, 10)} max={localDate()} {...form.register("transactionDate")} /></Field><Field label="Phương thức" htmlFor="payment-method"><select id="payment-method" {...form.register("paymentMethod")}>{Object.entries(methods).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field></div><Field label="Ghi chú" htmlFor="payment-note"><textarea id="payment-note" rows={3} maxLength={2000} {...form.register("note")} /></Field>{error && <div className="form-error" role="alert">{error}</div>}<div className="form-footer"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><SubmitButton loading={busy}>Xác nhận thanh toán</SubmitButton></div></form></Dialog>;
}
export function ContactModal({ contact, onClose, onDone }: FormProps & { contact?: Contact }) {
  const [error, setError] = useState("");
  const form = useForm<z.input<typeof contactSchema>, unknown, z.output<typeof contactSchema>>({ resolver: zodResolver(contactSchema), defaultValues: { name: contact?.name || "", phone: contact?.phone || "", email: contact?.email || "", note: contact?.note || "" } });
  return <Dialog open onClose={onClose} title={contact ? "Chỉnh sửa người liên hệ" : "Thêm người liên hệ"}><form className="form-stack" onSubmit={form.handleSubmit(async (values) => { setError(""); try { await mutate(contact ? "contact.update" : "contact.create", { ...values, ...(contact ? { id: contact.id } : {}) }); toast.success("Đã lưu người liên hệ"); onDone(); } catch (failure) { setError((failure as Error).message); } })}><Field label="Họ và tên *" htmlFor="contact-name" error={form.formState.errors.name?.message}><input id="contact-name" autoComplete="name" maxLength={100} {...form.register("name")} /></Field><div className="form-grid"><Field label="Số điện thoại" htmlFor="contact-phone"><input id="contact-phone" type="tel" maxLength={30} {...form.register("phone")} /></Field><Field label="Email" htmlFor="contact-email" error={form.formState.errors.email?.message}><input id="contact-email" type="email" {...form.register("email")} /></Field></div><Field label="Ghi chú" htmlFor="contact-note"><textarea id="contact-note" rows={3} maxLength={2000} {...form.register("note")} /></Field>{error && <div className="form-error" role="alert">{error}</div>}<div className="form-footer"><Button type="button" variant="secondary" onClick={onClose}>Hủy</Button><SubmitButton loading={form.formState.isSubmitting}>Lưu người liên hệ</SubmitButton></div></form></Dialog>;
}
export function TextActionModal({ title, label, onClose, onSubmit, type = "text", initial = "" }: { title: string; label: string; onClose: () => void; onSubmit: (value: string) => Promise<void>; type?: "text" | "date"; initial?: string }) {
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title={title}><form className="form-stack" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await onSubmit(value); onClose(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}><Field label={label} htmlFor="action-value">{type === "date" ? <input id="action-value" type="date" min={localDate()} value={value} onChange={(event) => setValue(event.target.value)} required /> : <textarea id="action-value" rows={4} maxLength={2000} value={value} onChange={(event) => setValue(event.target.value)} required />}</Field>{error && <div className="form-error" role="alert">{error}</div>}<div className="form-footer"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button><SubmitButton loading={busy}>Lưu</SubmitButton></div></form></Dialog>;
}
export function ConfirmDialog({ title, message, onClose, onConfirm }: { title: string; message: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title={title} description={message}>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-footer"><Button variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button><Button variant="danger" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>{busy ? "Đang xử lý…" : "Xác nhận"}</Button></div></Dialog>;
}
