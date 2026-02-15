"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Wallet, Plus, History, ArrowUpRight, MessageCircle, Copy, Check, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

interface BalanceTransaction {
  id: string;
  amount: number;
  type: "DEPOSIT" | "PURCHASE";
  description: string;
  createdAt: string;
}

function BalancePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [copiedVodafone, setCopiedVodafone] = useState(false);
  const [copiedEtisalat, setCopiedEtisalat] = useState(false);
  const paymentStatusProcessed = useRef(false);

  // Check if user is a student (USER role)
  const isStudent = session?.user?.role === "USER";
  
  const vodafoneCashNumber = "01017577047";
  const etisalatCashNumber = "01017577047";
  const whatsappNumber = "01017577047";
  const whatsappLink = `https://wa.me/201017577047`;

  // Initial data fetch
  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, []);

  // Handle payment status from URL params
  useEffect(() => {
    const paymentStatus = searchParams.get("status");
    const paymentId = searchParams.get("payment");

    if (paymentStatus && paymentId && !paymentStatusProcessed.current) {
      paymentStatusProcessed.current = true;
      
      if (paymentStatus === "success") {
        toast.success("تم إضافة الرصيد بنجاح!");
        fetchBalance();
        fetchTransactions();
        // Clean up URL
        setTimeout(() => {
          router.replace("/dashboard/balance");
          paymentStatusProcessed.current = false;
        }, 100);
      } else if (paymentStatus === "failed") {
        toast.error("فشلت عملية الدفع. يرجى المحاولة مرة أخرى.");
        setTimeout(() => {
          router.replace("/dashboard/balance");
          paymentStatusProcessed.current = false;
        }, 100);
      } else if (paymentStatus === "pending") {
        toast.info("في انتظار تأكيد الدفع. سيتم تحديث الرصيد قريباً.");
        setTimeout(() => {
          router.replace("/dashboard/balance");
          paymentStatusProcessed.current = false;
        }, 100);
      }
    } else if (!paymentStatus && !paymentId) {
      // Reset the flag when there's no payment status
      paymentStatusProcessed.current = false;
    }
  }, [searchParams]);

  // Check sessionStorage for payment status (only once on mount)
  useEffect(() => {
    const storedStatus = sessionStorage.getItem("paymentStatus");
    if (storedStatus) {
      try {
        const statusData = JSON.parse(storedStatus);
        const timeDiff = Date.now() - statusData.timestamp;
        // Only show if less than 5 minutes ago
        if (timeDiff < 5 * 60 * 1000) {
          if (statusData.status === "success") {
            toast.success("تم إضافة الرصيد بنجاح!");
            fetchBalance();
            fetchTransactions();
          }
          sessionStorage.removeItem("paymentStatus");
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await fetch("/api/user/balance");
      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance);
      }
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await fetch("/api/balance/transactions");
      if (response.ok) {
        const data = await response.json();
        setTransactions(data);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setIsLoadingTransactions(false);
    }
  };

  const handleAddBalance = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    setIsLoading(true);
    try {
      // Create payment record
      const prepareResponse = await fetch("/api/payment/fawaterak/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: parseFloat(amount) }),
      });

      if (!prepareResponse.ok) {
        throw new Error("فشل في إعداد عملية الدفع");
      }

      const { paymentId } = await prepareResponse.json();

      // Navigate to payment plugin page
      window.location.href = `/dashboard/balance/payment-plugin?amount=${amount}&paymentId=${paymentId}`;
    } catch (error) {
      console.error("Error preparing payment:", error);
      toast.error("حدث خطأ أثناء إعداد عملية الدفع");
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const copyToClipboard = (text: string, setCopiedState: (value: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopiedState(true);
    toast.success("تم نسخ الرقم");
    setTimeout(() => setCopiedState(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">إدارة الرصيد</h1>
          <p className="text-muted-foreground">
            عرض رصيد حسابك وسجل المعاملات وإضافة رصيد جديد
          </p>
        </div>
      </div>

      {/* Balance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            رصيد الحساب
          </CardTitle>
          <CardDescription>
            الرصيد المتاح في حسابك
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-brand">
            {balance.toFixed(2)} جنيه
          </div>
        </CardContent>
      </Card>

      {/* Add Balance Section - Available for all users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            إضافة رصيد
          </CardTitle>
          <CardDescription>
            أضف مبلغ إلى رصيد حسابك عبر Fawaterak
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              type="number"
              placeholder="أدخل المبلغ"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
              className="flex-1"
            />
            <Button 
              onClick={handleAddBalance}
              disabled={isLoading}
              className="bg-brand hover:bg-brand/90"
            >
              {isLoading ? "جاري التوجيه..." : "إضافة رصيد عبر Fawaterak"}
            </Button>
          </div>
        </CardContent>
      </Card>

      

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            سجل المعاملات
          </CardTitle>
          <CardDescription>
            تاريخ جميع المعاملات المالية
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTransactions ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto"></div>
              <p className="mt-2 text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">لا توجد معاملات حتى الآن</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      transaction.type === "DEPOSIT" 
                        ? "bg-green-100 text-green-600" 
                        : "bg-red-100 text-red-600"
                    }`}>
                      {transaction.type === "DEPOSIT" ? (
                        <Plus className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                                         <div>
                       <p className="font-medium">
                         {transaction.description.includes("Added") && transaction.type === "DEPOSIT" 
                           ? transaction.description.replace(/Added (\d+(?:\.\d+)?) EGP to balance/, "تم إضافة $1 جنيه إلى الرصيد")
                           : transaction.description.includes("Purchased course:") && transaction.type === "PURCHASE"
                           ? transaction.description.replace(/Purchased course: (.+)/, "تم شراء الكورس: $1")
                           : transaction.description
                         }
                       </p>
                       <p className="text-sm text-muted-foreground">
                         {formatDate(transaction.createdAt)}
                       </p>
                       <p className="text-xs text-muted-foreground">
                         {transaction.type === "DEPOSIT" ? "إيداع" : "شراء كورس"}
                       </p>
                     </div>
                  </div>
                  <div className={`font-bold ${
                    transaction.type === "DEPOSIT" ? "text-green-600" : "text-red-600"
                  }`}>
                    {transaction.type === "DEPOSIT" ? "+" : "-"}
                    {Math.abs(transaction.amount).toFixed(2)} جنيه
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BalancePage() {
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
      <BalancePageContent />
    </Suspense>
  );
} 