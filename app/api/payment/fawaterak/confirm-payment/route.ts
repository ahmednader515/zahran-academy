import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { userId, user } = await auth();
    
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { paymentId } = await req.json();

    if (!paymentId) {
      return new NextResponse("Payment ID is required", { status: 400 });
    }

    // Find payment record
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { user: true },
    });

    if (!payment) {
      return new NextResponse("Payment not found", { status: 404 });
    }

    // Verify user owns this payment
    if (payment.userId !== userId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // If payment is already PAID (webhook processed it), just return success
    if (payment.status === "PAID") {
      const userBalance = await db.user.findUnique({
        where: { id: userId },
        select: { balance: true },
      });

      return NextResponse.json({
        success: true,
        message: "Payment already processed",
        status: "PAID",
        balance: userBalance?.balance || 0,
      });
    }

    // If not PAID yet, update it (webhook might have been missed)
    // Update payment status
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
      },
    });

    // Add balance using atomic increment
    const updatedUser = await db.user.update({
      where: { id: payment.userId },
      data: {
        balance: {
          increment: payment.amount, // Prisma atomic increment operation
        },
      },
      select: { balance: true },
    });

    // Create transaction record
    await db.balanceTransaction.create({
      data: {
        userId: payment.userId,
        amount: payment.amount,
        type: "DEPOSIT",
        description: `تم إضافة ${payment.amount} جنيه إلى الرصيد عبر Fawaterak`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Payment confirmed and balance updated",
      status: "PAID",
      balance: updatedUser.balance,
    });
  } catch (error) {
    console.error("[FAWATERAK_CONFIRM_PAYMENT]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

