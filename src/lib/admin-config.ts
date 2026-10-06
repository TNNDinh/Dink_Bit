export function adminEmail() {
  return (process.env.ADMIN_EMAIL || "tranngocnguyendinh@gmail.com").trim().toLowerCase();
}
