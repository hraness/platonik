import { suiteOidcSurfaceHandler } from "@hraness/suite-accounts/oidc-surface-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const handle = suiteOidcSurfaceHandler("platonik");
export const GET = handle;
export const POST = handle;
