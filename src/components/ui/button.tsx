import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva("button", { variants: { variant: { primary: "button-primary", secondary: "button-secondary", ghost: "button-ghost", danger: "button-danger" }, size: { default: "", icon: "button-icon", small: "button-small" } }, defaultVariants: { variant: "primary", size: "default" } });
export function Button({ className, variant, size, ...props }: React.ComponentProps<"button"> & VariantProps<typeof variants>) {
  return <button className={cn(variants({ variant, size }), className)} {...props} />;
}
