import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const FAWATERAK_API_URL = process.env.FAWATERAK_API_URL || "https://staging.fawaterk.com/api/v2";
const FAWATERAK_API_KEY = process.env.FAWATERAK_API_KEY;
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!FAWATERAK_API_KEY) {
      return new NextResponse("Fawaterak API key not configured", { status: 500 });
    }

    // Check if this is a plugin proxy request
    const isPluginProxy = req.headers.get("X-Plugin-Proxy") === "true";

    if (!isPluginProxy) {
      return new NextResponse("Invalid request", { status: 400 });
    }

    const invoiceData = await req.json();

    // Extract paymentId from payLoad
    let paymentId: string | null = null;
    try {
      const payLoad = typeof invoiceData.payLoad === "string" 
        ? JSON.parse(invoiceData.payLoad) 
        : invoiceData.payLoad;
      paymentId = payLoad?.paymentId || null;
    } catch (e) {
      console.error("[FAWATERAK_CREATE] Error parsing payLoad:", e);
    }

    // Create invoice via Fawaterak API
    const response = await fetch(`${FAWATERAK_API_URL}/createInvoiceLink`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FAWATERAK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoiceData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[FAWATERAK_CREATE] Error:", errorText);
      return new NextResponse("Failed to create invoice", { status: response.status });
    }

    const result = await response.json();
    
    console.log("[FAWATERAK_CREATE] Full response:", JSON.stringify(result, null, 2));

    // Check various possible response structures
    let invoiceKey: string | null = null;
    let invoiceUrl: string | null = null;

    if (result.data) {
      invoiceKey = result.data.invoice_key || result.data.invoiceKey || result.data.invoice_id || null;
      invoiceUrl = result.data.invoiceUrl || result.data.frame_url || result.data.invoice_url || result.data.url || null;
    } else if (result.invoice_key || result.invoiceKey) {
      // Response might be flat
      invoiceKey = result.invoice_key || result.invoiceKey || result.invoice_id || null;
      invoiceUrl = result.invoiceUrl || result.frame_url || result.invoice_url || result.url || null;
    }

    if (!invoiceUrl) {
      console.error("[FAWATERAK_CREATE] No invoice URL found in response:", result);
      return NextResponse.json(
        { 
          error: "Invalid response from Fawaterak - no invoice URL found",
          response: result 
        },
        { status: 500 }
      );
    }

    // Update payment record with invoice details
    if (paymentId) {
      try {
        await db.payment.update({
          where: { id: paymentId },
          data: {
            fawaterakInvoiceId: invoiceKey,
            fawaterakInvoiceUrl: invoiceUrl,
          },
        });
      } catch (error: any) {
        // Handle unique constraint violation (invoice key already exists)
        if (error.code === "P2002") {
          // Try to update by invoice key instead
          try {
            const existingPayment = await db.payment.findUnique({
              where: { fawaterakInvoiceId: invoiceKey },
            });
            
            if (existingPayment && existingPayment.userId === userId) {
              await db.payment.update({
                where: { id: existingPayment.id },
                data: { fawaterakInvoiceUrl: invoiceUrl },
              });
            }
          } catch (e) {
            console.error("[FAWATERAK_CREATE] Error updating existing payment:", e);
          }
        } else {
          console.error("[FAWATERAK_CREATE] Error updating payment:", error);
        }
      }
    }

    // Return consistent structure with invoice URL
    return NextResponse.json({
      success: true,
      data: {
        invoiceUrl: invoiceUrl,
        invoiceKey: invoiceKey,
        ...result.data, // Include any other data from Fawaterak
      },
      ...result, // Include any top-level fields from Fawaterak response
    });
  } catch (error) {
    console.error("[FAWATERAK_CREATE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

