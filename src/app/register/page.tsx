import { AuthForm } from "@/components/auth-form";
export const dynamic = "force-dynamic";
export default function Register() { return <AuthForm mode="register" google={!!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)} />; }
