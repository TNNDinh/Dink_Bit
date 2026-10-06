import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/current-user";
import { ApiError } from "@/lib/security";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view = [] } = await params;
  if (view.length > 2 || (view[0] && !["debts", "contacts", "transactions", "reports", "reminders", "settings", "admin"].includes(view[0])) || (view.length === 2 && !["debts", "contacts"].includes(view[0]))) notFound();
  let user;
  try { user = await currentUser(); } catch (error) { if (error instanceof ApiError && error.status === 401) redirect("/login"); throw error; }
  if (view[0] === "admin" && user.role !== "ADMIN") notFound();
  return <Workspace user={user} view={view[0] || "overview"} id={view[1]} />;
}
