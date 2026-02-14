import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const FAWATERAK_API_KEY = process.env.FAWATERAK_API_KEY;
    const FAWATERAK_PROVIDER_KEY = process.env.FAWATERAK_PROVIDER_KEY;

    if (!FAWATERAK_API_KEY || !FAWATERAK_PROVIDER_KEY) {
      return new NextResponse("Fawaterak configuration missing", { status: 500 });
    }

    // Get domain from request headers
    const host = req.headers.get("host") || req.headers.get("x-forwarded-host") || "localhost";
    let domain = host.split(":")[0]; // Remove port if present
    
    // Normalize localhost
    if (domain === "localhost" || domain === "127.0.0.1") {
      domain = "localhost";
    }

    // Generate hash key
    // Format: Domain={domain}&ProviderKey={FAWATERAK_PROVIDER_KEY}
    const queryParam = `Domain=${domain}&ProviderKey=${FAWATERAK_PROVIDER_KEY}`;
    const hashKey = crypto
      .createHmac("sha256", FAWATERAK_API_KEY)
      .update(queryParam)
      .digest("hex");

    return NextResponse.json({
      hashKey,
      domain,
    });
  } catch (error) {
    console.error("[FAWATERAK_HASH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

