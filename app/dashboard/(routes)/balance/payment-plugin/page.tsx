"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

declare global {
  interface Window {
    jQuery: any;
    fawaterkCheckout: any;
    fawaterk: any;
    Fawaterk: any;
  }
}

function PaymentPluginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackInvoiceUrl, setFallbackInvoiceUrl] = useState<string | null>(null);
  const pluginContainerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const amount = searchParams.get("amount");
  const paymentId = searchParams.get("paymentId");

  useEffect(() => {
    // Listen for postMessage from payment status pages
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "FAWATERAK_PAYMENT_SUCCESS") {
        router.push(`/dashboard/balance?payment=${event.data.paymentId}&status=success`);
      } else if (event.data.type === "FAWATERAK_PAYMENT_FAILED") {
        router.push(`/dashboard/balance?payment=${event.data.paymentId}&status=failed`);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router]);


  const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        // Wait a bit for the script to initialize
        setTimeout(() => resolve(), 500);
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = false; // Load synchronously to ensure proper initialization
      script.onload = () => {
        // Wait a bit for the script to initialize and expose functions
        setTimeout(() => resolve(), 1000);
      };
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  };

  useEffect(() => {
    if (!amount || !paymentId || !session?.user || initializedRef.current) {
      return;
    }

    initializePlugin();
  }, [amount, paymentId, session]);

  const createInvoiceDirectly = async () => {
    try {
      const user = session?.user;
      if (!user) {
        throw new Error("المستخدم غير مسجل الدخول");
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

      const invoiceData = {
        cartTotal: amount,
        currency: "EGP",
        redirectOutIframe: true,
        customer: {
          customer_unique_id: user.id,
          first_name: user.fullName?.split(" ")[0] || "User",
          last_name: user.fullName?.split(" ").slice(1).join(" ") || "",
          email: user.email || `${user.id}@example.com`,
          phone: user.phoneNumber || "",
        },
        redirectionUrls: {
          successUrl: `${baseUrl}/payment/success?payment=${paymentId}`,
          failUrl: `${baseUrl}/payment/fail?payment=${paymentId}`,
          pendingUrl: `${baseUrl}/payment/pending?payment=${paymentId}`,
        },
        webhookUrl: `${baseUrl}/api/payment/fawaterak/webhook/paid`,
        cartItems: [
          {
            name: "إضافة رصيد",
            price: amount,
            quantity: "1",
          },
        ],
        deduct_total_amount: 1,
        payLoad: {
          paymentId: paymentId,
          userId: user.id,
          timestamp: new Date().toISOString(),
        },
      };

      const createResponse = await fetch("/api/payment/fawaterak/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Plugin-Proxy": "true",
        },
        body: JSON.stringify(invoiceData),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`فشل في إنشاء فاتورة الدفع: ${errorText}`);
      }

      const invoiceResult = await createResponse.json();
      const invoiceUrl = 
        invoiceResult.data?.invoiceUrl || 
        invoiceResult.data?.frame_url || 
        invoiceResult.data?.invoice_url ||
        invoiceResult.data?.url ||
        invoiceResult.invoiceUrl ||
        invoiceResult.frame_url ||
        invoiceResult.invoice_url ||
        invoiceResult.url ||
        null;

      if (!invoiceUrl) {
        throw new Error("لم يتم الحصول على رابط الفاتورة من Fawaterak");
      }

      // Display invoice in iframe using state
      setFallbackInvoiceUrl(invoiceUrl);
      setLoading(false);
    } catch (err: any) {
      throw err;
    }
  };

  const initializePlugin = async () => {
    if (initializedRef.current) return;
    
    try {
      initializedRef.current = true;
      setInitializing(true);
      setError(null);

      // Since the plugin script doesn't seem to be working, use direct invoice creation
      // This creates the invoice and shows it in an iframe, which includes payment method selection
      await createInvoiceDirectly();
    } catch (err: any) {
      console.error("Error initializing plugin:", err);
      setError(err.message || "حدث خطأ أثناء تحميل صفحة الدفع");
      setLoading(false);
      initializedRef.current = false;
    } finally {
      setInitializing(false);
    }
  };

  if (!amount || !paymentId || !session?.user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-red-600">معلومات الدفع غير صحيحة</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard/balance")}
        >
          <ArrowLeft className="h-4 w-4 rtl:ml-2 ltr:mr-2" />
          العودة
        </Button>
        <div>
          <h1 className="text-2xl font-bold">إضافة رصيد</h1>
          <p className="text-muted-foreground">
            اختر طريقة الدفع المناسبة لك
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>المبلغ: {amount} جنيه</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            ref={pluginContainerRef}
            id="fawaterk-plugin-container"
            className="min-h-[400px] relative"
          >
            {loading || initializing ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center py-12 bg-background/80 backdrop-blur-sm z-10">
                <Loader2 className="h-8 w-8 animate-spin text-brand mb-4" />
                <p className="text-muted-foreground">
                  {initializing ? "جاري تحميل صفحة الدفع..." : "جاري التحميل..."}
                </p>
              </div>
            ) : error ? (
              <div className="text-center py-12 space-y-4">
                <p className="text-red-600 mb-4">{error}</p>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>إذا استمرت المشكلة، يرجى:</p>
                  <ul className="list-disc list-inside space-y-1 text-right">
                    <li>التحقق من الاتصال بالإنترنت</li>
                    <li>التحقق من إعدادات Fawaterak في لوحة التحكم</li>
                    <li>إضافة رابط المكون الصحيح في ملف .env</li>
                  </ul>
                </div>
                <Button 
                  onClick={() => {
                    initializedRef.current = false;
                    setError(null);
                    setLoading(true);
                    initializePlugin();
                  }}
                  className="mt-4"
                >
                  إعادة المحاولة
                </Button>
              </div>
            ) : fallbackInvoiceUrl ? (
              <iframe
                src={fallbackInvoiceUrl}
                className="w-full min-h-[600px] border-none rounded-lg"
                allow="payment"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation"
                title="Fawaterak Payment"
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentPluginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Card>
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
      <PaymentPluginContent />
    </Suspense>
  );
}
