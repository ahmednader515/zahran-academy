import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";

const FAWATERAK_API_KEY = process.env.FAWATERAK_API_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!FAWATERAK_API_KEY) {
      return new NextResponse("Fawaterak API key not configured", { status: 500 });
    }

    const body = await req.json();

    const {
      hashKey,
      invoice_key,
      invoice_id,
      payment_method,
      invoice_status,
      pay_load,
      referenceNumber,
    } = body;

    // Validate hash key
    const queryParam = `InvoiceId=${invoice_id}&InvoiceKey=${invoice_key}&PaymentMethod=${payment_method}`;
    const expectedHashKey = crypto
      .createHmac("sha256", FAWATERAK_API_KEY)
      .update(queryParam)
      .digest("hex");

    if (hashKey !== expectedHashKey) {
      console.error("[FAWATERAK_WEBHOOK] Invalid hash key");
      return new NextResponse("Invalid hash key", { status: 401 });
    }

    // Only process paid invoices (case-insensitive check)
    if (invoice_status !== "paid" && invoice_status !== "Paid" && invoice_status !== "PAID") {
      return NextResponse.json({
        success: true,
        message: "Status is not paid, ignoring",
      });
    }

    // Parse pay_load to get paymentId
    let paymentId: string | null = null;
    let userId: string | null = null;
    
    try {
      const payLoad = typeof pay_load === "string" ? JSON.parse(pay_load) : pay_load;
      paymentId = payLoad?.paymentId || null;
      userId = payLoad?.userId || null;
    } catch (e) {
      console.error("[FAWATERAK_WEBHOOK] Error parsing pay_load:", e);
    }

    // Find payment by invoice_key or paymentId (multiple strategies)
    let payment = null;
    
    // Strategy 1: Find by invoice key
    if (invoice_key) {
      payment = await db.payment.findUnique({
        where: { fawaterakInvoiceId: invoice_key },
        include: { user: true },
      });
    }
    
    // Strategy 2: Find by paymentId from pay_load
    if (!payment && paymentId) {
      payment = await db.payment.findUnique({
        where: { id: paymentId },
        include: { user: true },
      });
      
      // Update payment with invoice key for future lookups
      if (payment && invoice_key && !payment.fawaterakInvoiceId) {
        await db.payment.update({
          where: { id: payment.id },
          data: { fawaterakInvoiceId: invoice_key },
        });
      }
    }

    if (!payment) {
      console.error("[FAWATERAK_WEBHOOK] Payment not found", { invoice_key, paymentId });
      return new NextResponse("Payment not found", { status: 404 });
    }

    // Prevent duplicate processing
    if (payment.status === "PAID") {
      return NextResponse.json({
        success: true,
        message: "Payment already processed",
        paymentId: payment.id,
      });
    }

    // Update payment status
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paymentMethod: payment_method || payment.paymentMethod,
      },
    });

    // Update user balance using atomic increment operation
    const updatedUser = await db.user.update({
      where: { id: payment.userId },
      data: {
        balance: {
          increment: payment.amount, // Prisma atomic increment operation
        },
      },
      select: { balance: true },
    });

    // Create balance transaction
    await db.balanceTransaction.create({
      data: {
        userId: payment.userId,
        amount: payment.amount,
        type: "DEPOSIT",
        description: `تم إضافة ${payment.amount} جنيه إلى الرصيد عبر ${payment_method || "Fawaterak"}`,
      },
    });

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      newBalance: updatedUser.balance,
    });
  } catch (error) {
    console.error("[FAWATERAK_WEBHOOK]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

