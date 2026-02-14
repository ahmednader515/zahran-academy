import { NextRequest, NextResponse } from "next/server";

const FAWATERAK_API_URL = process.env.FAWATERAK_API_URL || "https://staging.fawaterk.com/api/v2";
const FAWATERAK_API_KEY = process.env.FAWATERAK_API_KEY;

export async function GET(req: NextRequest) {
  try {
    if (!FAWATERAK_API_KEY) {
      return new NextResponse("Fawaterak API key not configured", { status: 500 });
    }

    // Check if this is a plugin proxy request
    const isPluginProxy = req.headers.get("X-Plugin-Proxy") === "true";

    // Fetch payment methods from Fawaterak
    const response = await fetch(`${FAWATERAK_API_URL}/getPaymentmethods`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${FAWATERAK_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[FAWATERAK_METHODS] Error:", errorText);
      return new NextResponse("Failed to fetch payment methods", { status: response.status });
    }

    const data = await response.json();

    // If this is a plugin proxy request, return raw response
    if (isPluginProxy) {
      return NextResponse.json(data);
    }

    // Otherwise, format for frontend
    const methods = (data.data || []).map((method: any, index: number) => ({
      id: `${method.id}-${index}`,
      originalId: method.id,
      name: method.name_ar || method.name || method.id,
      icon: method.icon || null,
      commission: method.commission || 0,
    }));

    return NextResponse.json({ methods });
  } catch (error) {
    console.error("[FAWATERAK_METHODS]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

