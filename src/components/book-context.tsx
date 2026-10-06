"use client";
import { createContext, useContext } from "react";
import type { Contact, Debt } from "@/lib/types";
export type BookActions = {
  revision: number; refresh: () => void; addDebt: (options?: { debt?: Debt; contact?: Contact; initialType?: "RECEIVABLE" | "PAYABLE" }) => void;
  pay: (debt: Debt) => void; addContact: (contact?: Contact) => void;
  confirm: (title: string, message: string, action: () => Promise<void>) => void;
  note: (debt: Debt) => void; remind: (debt: Debt) => void;
};
export const BookContext = createContext<BookActions | null>(null);
export function useBook() { const context = useContext(BookContext); if (!context) throw new Error("Missing BookContext"); return context; }
