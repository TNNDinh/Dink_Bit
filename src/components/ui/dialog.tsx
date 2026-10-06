"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Dialog({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" /><DialogPrimitive.Content className="dialog-content"><div className="dialog-heading"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Description>{description || "Quản lý công nợ rõ ràng, chính xác."}</DialogPrimitive.Description></div><DialogPrimitive.Close className="button button-ghost button-icon" aria-label="Đóng hộp thoại"><X size={20} /></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
