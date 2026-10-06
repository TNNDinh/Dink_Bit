"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Bell, BookOpen, ChartNoAxesCombined, ChevronRight, CreditCard, House, LogOut, Menu, Moon, Plus, Search, Settings as SettingsIcon, ShieldCheck, Sun, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BookContext } from "@/components/book-context";
import { Dashboard } from "@/components/dashboard";
import { Admin } from "@/components/admin";
import { Contacts, DebtList, Transactions } from "@/components/lists";
import { ContactDetail, DebtDetail } from "@/components/details";
import { Reminders, Settings } from "@/components/reminders-settings";
import { AddDebtModal, ConfirmDialog, ContactModal, PaymentModal, TextActionModal } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, EmptyState, ErrorState } from "@/components/ui/common";
import { mutate, useDebounce, useResource } from "@/lib/client";
import type { BookActions } from "@/components/book-context";
import type { Contact, Debt, Notice, Payment, Profile } from "@/lib/types";
import { cn, localDate, money } from "@/lib/utils";

const navigation = [{ id: "overview", href: "/", label: "Tổng quan", icon: House }, { id: "debts", href: "/debts", label: "Công nợ", icon: Wallet }, { id: "contacts", href: "/contacts", label: "Người liên hệ", icon: Users }, { id: "transactions", href: "/transactions", label: "Giao dịch", icon: CreditCard }, { id: "reports", href: "/reports", label: "Báo cáo", icon: ChartNoAxesCombined }, { id: "reminders", href: "/reminders", label: "Nhắc thanh toán", icon: Bell }, { id: "admin", href: "/admin", label: "Quản trị", icon: ShieldCheck }, { id: "settings", href: "/settings", label: "Cài đặt", icon: SettingsIcon }];
export function Logo() { return <Link className="logo" href="/"><span><BookOpen size={23} strokeWidth={2.3} /></span><div>DinkBit<small>SỔ CÔNG NỢ CÁ NHÂN</small></div></Link>; }
function Navigation({ view, admin, onSelect }: { view: string; admin: boolean; onSelect?: () => void }) { return <nav className="navigation" aria-label="Điều hướng chính">{navigation.filter((item) => item.id !== "admin" || admin).map((item) => <Link href={item.href} key={item.id} onClick={onSelect} className={cn(view === item.id && "active")} aria-current={view === item.id ? "page" : undefined}><item.icon size={19} /><span>{item.label}</span>{view === item.id && <ChevronRight size={15} />}</Link>)}</nav>; }

export function Workspace({ user, view, id }: { user: Profile; view: string; id?: string }) {
  const router = useRouter(), [revision, setRevision] = useState(0), [modal, setModal] = useState<React.ReactNode>(null), [dark, setDark] = useState(false);
  const notices = useResource<{ items: Notice[]; unread: number }>("/api/book?resource=notifications", revision);
  useEffect(() => { const timer = setInterval(notices.reload, 60000); return () => clearInterval(timer); }, [notices.reload]);
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains("dark"));
    const frame = requestAnimationFrame(update); window.addEventListener("debtbook-theme", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("debtbook-theme", update); };
  }, []);
  useEffect(() => {
    const search = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        event.preventDefault(); setModal(<GlobalSearch onClose={() => setModal(null)} />);
      }
    };
    window.addEventListener("keydown", search);
    return () => window.removeEventListener("keydown", search);
  }, []);
  const close = () => setModal(null), refresh = () => setRevision((value) => value + 1), done = () => { close(); refresh(); };
  const actions: BookActions = {
    revision, refresh,
    addDebt: (options = {}) => setModal(<AddDebtModal {...options} onClose={close} onDone={done} />),
    pay: (debt) => setModal(<PaymentModal debt={debt} onClose={close} onDone={done} />),
    addContact: (contact) => setModal(<ContactModal contact={contact} onClose={close} onDone={done} />),
    confirm: (title, message, action) => setModal(<ConfirmDialog title={title} message={message} onClose={close} onConfirm={action} />),
    note: (debt) => setModal(<TextActionModal title="Thêm ghi chú" label="Nội dung ghi chú" onClose={close} onSubmit={async (note) => { await mutate("debt.note", { id: debt.id, note }); refresh(); toast.success("Đã thêm ghi chú"); }} />),
    remind: (debt) => setModal(<TextActionModal title="Đặt lịch nhắc tôi" label="Ngày nhắc trong ứng dụng" type="date" initial={localDate()} onClose={close} onSubmit={async (reminderDate) => { await mutate("reminder.create", { debtId: debt.id, reminderDate }); refresh(); toast.success("Đã đặt lịch nhắc trong ứng dụng"); }} />),
  };
  const title = navigation.find((item) => item.id === view)?.label || "Tổng quan";
  function toggleTheme() { const next = !document.documentElement.classList.contains("dark"); document.documentElement.classList.toggle("dark", next); localStorage.setItem("debtbook-theme", next ? "dark" : "light"); setDark(next); }
  const content = id && view === "debts" ? <DebtDetail id={id} /> : id && view === "contacts" ? <ContactDetail id={id} /> : view === "debts" ? <DebtList /> : view === "contacts" ? <Contacts /> : view === "transactions" ? <Transactions /> : view === "reports" ? <Dashboard name={user.name || "bạn"} reports /> : view === "reminders" ? <Reminders /> : view === "admin" && user.role === "ADMIN" ? <Admin /> : view === "settings" ? <Settings /> : <Dashboard name={user.name || "bạn"} />;
  return <BookContext.Provider value={actions}><a href="#main-content" className="skip-link">Đến nội dung chính</a><div className="app-shell"><aside className="sidebar"><Logo /><div className="nav-section-label">KHÔNG GIAN CÁ NHÂN</div><Navigation admin={user.role === "ADMIN"} view={view} /><div className="sidebar-bottom"><div className="sidebar-tip"><span><ShieldCheck size={19} /></span><strong>Rõ ràng để an tâm</strong><p>Ghi chép nhỏ hôm nay.<br />Nhẹ lòng hơn mỗi ngày.</p></div><div className="sidebar-user"><Avatar name={user.name || "Bạn"} /><Link href="/settings"><strong>{user.name || "Tài khoản"}</strong><small>{user.role === "ADMIN" ? "Quản trị viên" : "Tài khoản cá nhân"}</small></Link><Button variant="ghost" size="icon" aria-label="Đăng xuất" title="Đăng xuất" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={17} /></Button></div></div></aside><div className="main-shell"><header className="topbar"><Button className="mobile-menu" variant="ghost" size="icon" aria-label="Mở menu" onClick={() => setModal(<Dialog open title="DinkBit" onClose={close}><Navigation admin={user.role === "ADMIN"} view={view} onSelect={close} /><Button variant="secondary" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={16} />Đăng xuất</Button></Dialog>)}><Menu size={20} /></Button><div className="breadcrumb"><span>Không gian cá nhân</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="header-actions"><button className="global-search-trigger" onClick={() => setModal(<GlobalSearch onClose={close} />)}><Search size={17} /><span>Tìm người, công nợ, giao dịch…</span><kbd>/</kbd></button><Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={dark ? "Bật giao diện sáng" : "Bật giao diện tối"} title="Đổi giao diện">{dark ? <Sun size={19} /> : <Moon size={19} />}</Button><Button variant="ghost" size="icon" className="notification-trigger" aria-label={`Thông báo${notices.data?.unread ? `, ${notices.data.unread} chưa đọc` : ""}`} onClick={() => setModal(<NotificationCenter onClose={close} onRead={refresh} />)}><Bell size={19} />{!!notices.data?.unread && <span />}</Button><Link className="header-avatar" href="/settings" aria-label="Thông tin cá nhân"><Avatar name={user.name || "Bạn"} /></Link></div></header><main id="main-content" className="main-content" key={`${view}:${id || ""}`}>{content}</main></div></div><nav className="mobile-navigation" aria-label="Điều hướng di động">{navigation.filter((item) => ["overview", "debts", "contacts", "reports"].includes(item.id)).map((item) => <Link key={item.id} href={item.href} className={cn(view === item.id && "active")} aria-current={view === item.id ? "page" : undefined}><item.icon size={20} /><span>{item.label}</span></Link>)}</nav><Button className="fab" aria-label="Thêm nhanh" onClick={() => setModal(<Dialog open title="Thêm nhanh" onClose={close}><div className="quick-actions"><Button variant="secondary" onClick={() => actions.addDebt({ initialType: "RECEIVABLE" })}><ArrowDownLeft size={20} className="positive" />Họ nợ tôi</Button><Button variant="secondary" onClick={() => actions.addDebt({ initialType: "PAYABLE" })}><ArrowUpRight size={20} className="negative" />Tôi nợ họ</Button><Button variant="secondary" onClick={() => { close(); router.push("/debts"); toast.info("Chọn biểu tượng thanh toán bên cạnh khoản công nợ."); }}><CreditCard size={20} />Ghi nhận thanh toán</Button></div></Dialog>)}><Plus size={25} /></Button>{modal}</BookContext.Provider>;
}
function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState(""), debounced = useDebounce(query);
  const resource = useResource<{ contacts: Pick<Contact, "id" | "name">[]; debts: Debt[]; transactions: Payment[] }>(`/api/book?resource=search&q=${encodeURIComponent(debounced)}`);
  return <Dialog open title="Tìm kiếm" description="Tìm người, công nợ và giao dịch trong tài khoản của bạn." onClose={onClose}><div className="search-field"><Search size={18} /><input aria-label="Tìm kiếm toàn hệ thống" placeholder="Nhập ít nhất 2 ký tự…" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="search-results">{debounced.length < 2 ? <p className="muted">Tìm nhanh bằng tên hoặc nội dung công nợ.</p> : resource.loading ? <p role="status">Đang tìm kiếm…</p> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : resource.data && <>{!resource.data.contacts.length && !resource.data.debts.length && !resource.data.transactions.length && <EmptyState title="Không có kết quả" description="Thử tên hoặc nội dung khác." />}{resource.data.contacts.length > 0 && <h3>Người liên hệ</h3>}{resource.data.contacts.map((contact) => <Link key={contact.id} href={`/contacts/${contact.id}`} onClick={onClose}><Avatar name={contact.name} /><span>{contact.name}</span></Link>)}{resource.data.debts.length > 0 && <h3>Công nợ</h3>}{resource.data.debts.map((debt) => <Link key={debt.id} href={`/debts/${debt.id}`} onClick={onClose}><Wallet size={18} /><span>{debt.title}<small>{debt.contact.name}</small></span><strong>{money(debt.remainingAmount)}</strong></Link>)}{resource.data.transactions.length > 0 && <h3>Giao dịch</h3>}{resource.data.transactions.map((payment) => <Link key={payment.id} href={`/debts/${payment.debtId}`} onClick={onClose}><CreditCard size={18} /><span>{payment.contact?.name}<small>{payment.note || "Thanh toán"}</small></span><strong>{money(payment.amount)}</strong></Link>)}</>}</div></Dialog>;
}
function NotificationCenter({ onClose, onRead }: { onClose: () => void; onRead: () => void }) {
  const resource = useResource<{ items: Notice[]; unread: number }>("/api/book?resource=notifications");
  async function markRead(id?: string) {
    try { await mutate("notifications.read", id ? { id } : {}); resource.reload(); onRead(); }
    catch (error) { toast.error((error as Error).message); }
  }
  return <Dialog open title="Thông báo" description={`${resource.data?.unread || 0} thông báo chưa đọc`} onClose={onClose}>
    <Button variant="ghost" size="small" onClick={() => markRead()}>Đánh dấu tất cả đã đọc</Button>
    {resource.loading ? <p role="status">Đang tải…</p> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : resource.data?.items.length ? <div className="notification-list">{resource.data.items.map((notice) => <article key={notice.id} className={cn("notice-item", !notice.read && "unread")}>
      <span className="notice-icon"><Bell size={18} /></span><div><strong>{notice.title}</strong><p>{notice.message}</p><small>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(notice.createdAt))}</small>{notice.debtId && <Link href={`/debts/${notice.debtId}`} onClick={onClose}>Xem công nợ</Link>}{!notice.read && <Button variant="ghost" size="small" onClick={() => markRead(notice.id)}>Đánh dấu đã đọc</Button>}</div>{!notice.read && <i />}
    </article>)}</div> : <EmptyState title="Chưa có thông báo" description="Hoạt động và nhắc thanh toán sẽ hiển thị tại đây." />}
  </Dialog>;
}
