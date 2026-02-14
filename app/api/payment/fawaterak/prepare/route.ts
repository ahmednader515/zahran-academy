import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { amount, paymentMethod } = await req.json();

    if (!amount || amount <= 0) {
      return new NextResponse("Invalid amount", { status: 400 });
    }

    // Cancel any existing pending payments with the same amount
    await db.payment.updateMany({
      where: {
        userId,
        amount,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });

    // Create new payment record
    const payment = await db.payment.create({
      data: {
        userId,
        amount: parseFloat(amount),
        paymentMethod: paymentMethod || null,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
    });
  } catch (error) {
    console.error("[FAWATERAK_PREPARE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

