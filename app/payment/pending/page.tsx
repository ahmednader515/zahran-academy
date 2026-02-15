"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, ArrowLeft, Loader2 } from "lucide-react";

function PaymentPendingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);
  const paymentId = searchParams.get("payment");

  useEffect(() => {
    // Store in sessionStorage
    if (paymentId) {
      sessionStorage.setItem("paymentStatus", JSON.stringify({
        paymentId,
        status: "pending",
        timestamp: Date.now(),
      }));
    }

    // Countdown and redirect
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (window.parent !== window) {
            window.parent.location.href = `/dashboard/balance?payment=${paymentId}&status=pending`;
          } else {
            router.push(`/dashboard/balance?payment=${paymentId}&status=pending`);
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
            <Clock className="h-16 w-16 text-yellow-600" />
          </div>
          <CardTitle className="text-2xl">في انتظار التأكيد</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            تم استلام طلب الدفع الخاص بك. سيتم تحديث حالة الدفع قريباً.
          </p>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              سيتم إعادة التوجيه تلقائياً خلال {countdown} ثانية
            </p>
          </div>
          <Button
            onClick={() => {
              if (window.parent !== window) {
                window.parent.location.href = `/dashboard/balance?payment=${paymentId}&status=pending`;
              } else {
                router.push(`/dashboard/balance?payment=${paymentId}&status=pending`);
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

export default function PaymentPendingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand mb-4" />
                <p className="text-muted-foreground">جاري التحميل...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <PaymentPendingContent />
    </Suspense>
  );
}

