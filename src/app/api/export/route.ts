import writeExcelFile from "write-excel-file/node";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { debtFilters } from "@/lib/book";
import { csvCell, debtStatus, statuses } from "@/lib/domain";
import { ApiError, json, rateLimit, today } from "@/lib/security";
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    await rateLimit(`export:${user.id}`, 10, 3600);
    const params = new URL(request.url).searchParams, where = debtFilters(user.id, params);
    if (await db.debt.count({ where }) > 10000) throw new ApiError("Mỗi báo cáo tối đa 10.000 khoản. Thu hẹp khoảng thời gian.");
    const debts = await db.debt.findMany({ where, include: { contact: true }, orderBy: { createdDate: "desc" }, take: 10000 });
    const headers = ["Người liên hệ", "Loại", "Nội dung", "Tổng tiền (VND)", "Đã trả (VND)", "Còn lại (VND)", "Ngày tạo", "Hạn thanh toán", "Trạng thái"];
    const rows = debts.map((debt) => [debt.contact.name, debt.type === "RECEIVABLE" ? "Họ nợ tôi" : "Tôi nợ họ", debt.title, Number(debt.totalAmount), Number(debt.paidAmount), Number(debt.totalAmount - debt.paidAmount), debt.createdDate.toISOString().slice(0, 10), debt.dueDate?.toISOString().slice(0, 10) || "", statuses[debtStatus(debt, today())]]);
    if (params.get("format") === "xlsx") {
      const cells = [headers.map((value) => ({ value, fontWeight: "bold" as const, color: "#FFFFFF", backgroundColor: "#2563EB" })), ...rows.map((row) => row.map((value) => ({ value, ...(typeof value === "number" ? { format: '#,##0 "₫"' } : {}) })))];
      const bytes = await writeExcelFile(cells, { columns: headers.map((_, index) => ({ width: index === 2 ? 40 : 24 })) }).toBuffer();
      return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="dinkbit-${today()}.xlsx"`, "Cache-Control": "no-store" } });
    }
    return new Response("\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="dinkbit-${today()}.csv"`, "Cache-Control": "no-store" } });
  } catch (error) { return json({ error: error instanceof ApiError ? error.message : "Không thể xuất báo cáo." }, error instanceof ApiError ? error.status : 500); }
}
