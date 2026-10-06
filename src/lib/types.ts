import type { DebtStatus } from "@/lib/domain";
export type Contact = { id: string; name: string; phone: string; email: string; note: string; receivable: number; payable: number; transactions?: Payment[] };
export type Payment = { id: string; debtId: string; amount: number; type: "RECEIVABLE" | "PAYABLE"; paymentMethod: string; transactionDate: string; note: string; contact?: { name: string }; debt?: { title: string } };
export type Debt = {
  id: string; contactId: string; contact: { id: string; name: string; phone: string; email: string }; type: "RECEIVABLE" | "PAYABLE";
  title: string; description: string; totalAmount: number; paidAmount: number; remainingAmount: number;
  createdDate: string; dueDate: string | null; note: string; cancelled: boolean; status: DebtStatus;
  transactions?: Payment[]; activities?: { id: string; kind: string; message: string; amount: number | null; createdAt: string }[];
  attachments?: { id: string; fileName: string; size: number }[];
  reminders?: { id: string; reminderDate: string }[];
};
export type Totals = { receivable: number; payable: number; receivablePeople: number; payablePeople: number; overdue: number; overdueCount: number; collected: number; repaid: number; lent: number; borrowed: number };
export type Overview = { totals: Totals; points: { date: string; receivable: number; payable: number }[]; cashflow: { collected: number; repaid: number }; recent: Debt[]; due: Debt[]; top: { id: string; name: string; remaining: number }[] };
export type PageData<T> = { items: T[]; count: number; page: number; pageSize: number };
export type Notice = { id: string; title: string; message: string; read: boolean; debtId: string | null; createdAt: string };
export type Profile = { id: string; name: string | null; email: string; role: "USER" | "ADMIN"; reminderDays: number };
