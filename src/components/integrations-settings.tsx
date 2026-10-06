"use client";
import { useState } from "react";
import { Copy, KeyRound, Link as LinkIcon, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Field, LoadingSkeleton, SubmitButton } from "@/components/ui/common";
import { api, useResource } from "@/lib/client";
import { dateLabel } from "@/lib/utils";

type IntegrationKey = { id: string; name: string; prefix: string; scopes: ("READ" | "WRITE")[]; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null; active: boolean };
type IntegrationData = { items: IntegrationKey[]; apiUrl: string; openapiUrl: string };

export function IntegrationsSettings() {
  const [revision, setRevision] = useState(0), [name, setName] = useState(""), [access, setAccess] = useState("READ"), [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [token, setToken] = useState<string | null>(null), [revoking, setRevoking] = useState<IntegrationKey | null>(null);
  const resource = useResource<IntegrationData>("/api/integrations", revision);
  const refresh = () => setRevision((value) => value + 1);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ token: string }>("/api/integrations", { method: "POST", body: JSON.stringify({ name, access, expiresInDays: days }) });
      setToken(result.token); setName(""); refresh();
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function revoke() {
    if (!revoking) return;
    setBusy(true); setError("");
    try {
      await api("/api/integrations", { method: "DELETE", body: JSON.stringify({ id: revoking.id }) });
      setRevoking(null); refresh(); toast.success("Đã thu hồi token. AI không thể dùng token này nữa.");
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function copyToken() {
    try { await navigator.clipboard.writeText(token!); toast.success("Đã sao chép token. Chỉ lưu trong cấu hình bí mật của công cụ AI."); }
    catch { toast.error("Không thể sao chép. Hãy chọn token và sao chép thủ công."); }
  }
  return <section className="panel integrations-panel" aria-labelledby="ai-integration-heading">
    <div className="panel-heading"><div><h2 id="ai-integration-heading">Kết nối AI & API</h2><p>Cấp quyền cho công cụ bên ngoài đọc hoặc ghi sổ công nợ của riêng bạn</p></div><KeyRound size={22} /></div>
    <div className="info-banner"><ShieldCheck size={20} /><span>Không đưa mật khẩu đăng nhập cho AI. Token là chìa khóa dữ liệu của bạn; chỉ cấp quyền ghi cho công cụ tin cậy và yêu cầu xác nhận trước khi ghi.</span></div>
    {resource.data && <div className="integration-endpoints"><div><strong>API</strong><code>{resource.data.apiUrl}</code></div><div><strong>OpenAPI cho công cụ AI</strong><a className="text-link" href={resource.data.openapiUrl} target="_blank" rel="noreferrer"><LinkIcon size={14} />{resource.data.openapiUrl}</a></div></div>}
    <div className="settings-grid">
      <form className="form-stack" onSubmit={create}>
        <Field label="Tên kết nối AI" htmlFor="integration-name"><input id="integration-name" required minLength={1} maxLength={60} placeholder="Ví dụ: Trợ lý công nợ" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Quyền truy cập" htmlFor="integration-access"><select id="integration-access" value={access} onChange={(event) => setAccess(event.target.value)}><option value="READ">Chỉ đọc dữ liệu</option><option value="READ_WRITE">Đọc và ghi công nợ</option></select></Field>
        <Field label="Thời hạn token" htmlFor="integration-days"><select id="integration-days" value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7, 30, 90, 365].map((value) => <option key={value} value={value}>{value} ngày</option>)}</select></Field>
        {access === "READ_WRITE" && <p className="muted">AI có thể tạo người liên hệ, tạo và sửa công nợ. Không được xóa dữ liệu, ghi thanh toán hay quản trị tài khoản.</p>}
        <SubmitButton loading={busy}><Plus size={16} />Tạo token AI</SubmitButton>
      </form>
      <div>
        <h3>Token đã cấp</h3>
        {resource.loading ? <LoadingSkeleton /> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : resource.data?.items.length ? <div className="integration-key-list">{resource.data.items.map((key) => <article key={key.id} className="integration-key">
          <div><strong>{key.name}</strong><code>{key.prefix}…</code><small>{key.active ? key.scopes.includes("WRITE") ? "Đọc và ghi" : "Chỉ đọc" : key.revokedAt ? "Đã thu hồi" : "Hết hạn / đã vô hiệu hóa"} · Hết hạn {dateLabel(key.expiresAt)}</small><small>Dùng gần nhất: {key.lastUsedAt ? dateLabel(key.lastUsedAt) : "Chưa sử dụng"}</small></div>
          <Button variant="ghost" size="icon" disabled={!!key.revokedAt || busy} aria-label={`Thu hồi ${key.name}`} title="Thu hồi token" onClick={() => setRevoking(key)}><Trash2 size={17} /></Button>
        </article>)}</div> : <p className="muted">Chưa có token. Mặc định chưa AI nào được truy cập dữ liệu của bạn.</p>}
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="muted">Token chỉ hiển thị một lần, được lưu dạng hash và có thể thu hồi bất cứ lúc nào. Đổi mật khẩu qua email cũng vô hiệu hóa token cũ. Danh sách hiển thị 50 token gần nhất, tối đa 10 token hoạt động.</p>
    {token && <Dialog open title="Lưu token AI của bạn" description="Token chỉ hiện lần này. Ai có token đều sử dụng được quyền bạn đã cấp; không đăng công khai hoặc đưa vào nội dung chat." onClose={() => setToken(null)}>
      <Field label="Token API (chỉ hiển thị một lần)" htmlFor="new-integration-token"><textarea id="new-integration-token" rows={3} readOnly value={token} spellCheck={false} /></Field>
      <div className="form-footer"><Button variant="secondary" onClick={copyToken}><Copy size={16} />Sao chép token</Button><Button onClick={() => setToken(null)}>Đã lưu token</Button></div>
    </Dialog>}
    {revoking && <Dialog open title="Thu hồi token AI" description={`Dừng quyền truy cập của ${revoking.name}. Không xóa công nợ đã ghi.`} onClose={() => setRevoking(null)}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-footer"><Button variant="secondary" disabled={busy} onClick={() => setRevoking(null)}>Hủy</Button><Button variant="danger" disabled={busy} onClick={revoke}>Thu hồi token</Button></div>
    </Dialog>}
  </section>;
}
