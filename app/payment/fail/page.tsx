"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft } from "lucide-react";

export default function PaymentFailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);
  const paymentId = searchParams.get("payment");

  useEffect(() => {
    // Notify parent window if in iframe
    if (window.parent !== window) {
      window.parent.postMessage(
        {
          type: "FAWATERAK_PAYMENT_FAILED",
          paymentId: paymentId,
        },
        "*"
      );
    }

    // Store in sessionStorage
    if (paymentId) {
      sessionStorage.setItem("paymentStatus", JSON.stringify({
        paymentId,
        status: "failed",
        timestamp: Date.now(),
      }));
    }

    // Countdown and redirect
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (window.parent !== window) {
            window.parent.location.href = `/dashboard/balance?payment=${paymentId}&status=failed`;
          } else {
            router.push(`/dashboard/balance?payment=${paymentId}&status=failed`);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [paymentId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <XCircle className="h-16 w-16 text-red-600" />
          </div>
          <CardTitle className="text-2xl">فشل الدفع</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            لم يتم إتمام عملية الدفع. يرجى المحاولة مرة أخرى.
          </p>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              سيتم إعادة التوجيه تلقائياً خلال {countdown} ثانية
            </p>
          </div>
          <Button
            onClick={() => {
              if (window.parent !== window) {
                window.parent.location.href = `/dashboard/balance?payment=${paymentId}&status=failed`;
              } else {
                router.push(`/dashboard/balance?payment=${paymentId}&status=failed`);
              }
            }}
            variant="outline"
            className="w-full"
          >
            <ArrowLeft className="h-4 w-4 rtl:ml-2 ltr:mr-2" />
            العودة إلى صفحة الرصيد
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

