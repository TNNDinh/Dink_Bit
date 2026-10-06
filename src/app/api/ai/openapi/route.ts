import { integrationOpenapi } from "@/lib/integration-openapi";
import { json } from "@/lib/security";
export async function GET(request: Request) { return json(integrationOpenapi(request)); }
