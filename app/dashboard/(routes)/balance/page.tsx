"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Wallet, Plus, History, ArrowUpRight, MessageCircle, Copy, Check, CheckCircle, XCircle, Clock, Loader2, CreditCard, Smartphone } from "lucide-react";

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
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [isLoadingMethods, setIsLoadingMethods] = useState(true);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const paymentStatusProcessed = useRef(false);
  const paymentRedirectHandled = useRef(false);

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
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch("/api/payment/fawaterak/methods");
      if (response.ok) {
        const data = await response.json();
        console.log("Payment methods response:", data);
        const methods = data.methods || [];
        console.log("All payment methods:", methods);
        // Log methods with icons
        methods.forEach((method: any) => {
          if (method.icon) {
            console.log(`Method: ${method.name}, Icon: ${method.icon}`);
          }
        });
        setPaymentMethods(methods);
      } else {
        console.error("Failed to fetch payment methods:", response.status, response.statusText);
        // Set empty array on error, fallback will be used
        setPaymentMethods([]);
      }
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      // Set empty array on error, fallback will be used
      setPaymentMethods([]);
    } finally {
      setIsLoadingMethods(false);
    }
  };

  // Group payment methods by category
  const getPaymentMethodsByCategory = () => {
    // If no methods from API, return fallback structure
    if (paymentMethods.length === 0) {
      return {
        mobileWallets: [],
        fawry: [],
        cards: [],
        useFallback: true
      };
    }

    const mobileWallets = paymentMethods.filter((method: any) => {
      const name = (method.name || "").toLowerCase();
      const id = String(method.originalId || method.id || "").toLowerCase();
      const matches = name.includes("vodafone") ||
        name.includes("orange") ||
        name.includes("etisalat") ||
        name.includes("we") ||
        name.includes("wallet") ||
        name.includes("محفظة") ||
        name.includes("محافظ") ||
        name.includes("الكترونية") ||
        name.includes("إلكترونية") ||
        name.includes("كاش") ||
        name.includes("pay5") ||
        id.includes("wallet") ||
        id.includes("vodafone") ||
        id.includes("orange") ||
        id.includes("etisalat") ||
        id.includes("we") ||
        id.includes("pay5");
      
      if (matches) {
        console.log("Found mobile wallet:", method.name, "Icon:", method.icon);
      }
      return matches;
    });

    const fawry = paymentMethods.filter((method: any) => {
      const name = (method.name || "").toLowerCase();
      const id = String(method.originalId || method.id || "").toLowerCase();
      const matches = name.includes("fawry") ||
        name.includes("فوري") ||
        id.includes("fawry");
      
      if (matches) {
        console.log("Found Fawry:", method.name, "Icon:", method.icon);
      }
      return matches;
    });

    const cards = paymentMethods.filter((method: any) => {
      const name = (method.name || "").toLowerCase();
      const id = String(method.originalId || method.id || "").toLowerCase();
      const matches = name.includes("visa") ||
        name.includes("فيزا") ||
        name.includes("mastercard") ||
        name.includes("ماستر") ||
        name.includes("master") ||
        name.includes("كارد") ||
        name.includes("كارد") ||
        name.includes("meeza") ||
        name.includes("ميزة") ||
        name.includes("card") ||
        name.includes("بطاقة") ||
        name.includes("credit") ||
        name.includes("debit") ||
        name.includes("mc_vi") ||
        id.includes("card") ||
        id.includes("visa") ||
        id.includes("mastercard") ||
        id.includes("meeza") ||
        id.includes("mc_vi");
      
      if (matches) {
        console.log("Found card:", method.name, "Icon:", method.icon);
      }
      return matches;
    });

    console.log("Grouped methods - Mobile Wallets:", mobileWallets.length, "Fawry:", fawry.length, "Cards:", cards.length);

    return { mobileWallets, fawry, cards, useFallback: false };
  };

  // Client-side payment confirmation function (backup mechanism)
  const verifyAndUpdateBalance = async (paymentId: string) => {
    try {
      const response = await fetch("/api/payment/fawaterak/confirm-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Balance already updated by webhook or confirm endpoint
          await fetchBalance(); // Refresh balance display
          await fetchTransactions(); // Refresh transaction list
          return true;
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("[BALANCE] Payment confirmation error:", errorData);
      }
    } catch (error) {
      console.error("[BALANCE] Error confirming payment:", error);
    }
    return false;
  };

  // Handle payment status from URL params
  useEffect(() => {
    const paymentStatus = searchParams.get("status");
    const paymentId = searchParams.get("payment");

    if (paymentId && paymentStatus && !paymentRedirectHandled.current) {
      paymentRedirectHandled.current = true;
      
      if (paymentStatus === "success") {
        // Verify and update balance (backup mechanism if webhook missed)
        verifyAndUpdateBalance(paymentId).then(() => {
          toast.success("تم إضافة الرصيد بنجاح!");
          // Clean up URL
          setTimeout(() => {
            router.replace("/dashboard/balance");
            paymentRedirectHandled.current = false;
          }, 1000);
        });
      } else if (paymentStatus === "failed") {
        toast.error("فشلت عملية الدفع. يرجى المحاولة مرة أخرى.");
        setTimeout(() => {
          router.replace("/dashboard/balance");
          paymentRedirectHandled.current = false;
        }, 100);
      } else if (paymentStatus === "pending") {
        toast.info("في انتظار تأكيد الدفع. سيتم تحديث الرصيد قريباً.");
        setTimeout(() => {
          router.replace("/dashboard/balance");
          paymentRedirectHandled.current = false;
        }, 100);
      }
    } else if (!paymentStatus && !paymentId) {
      // Reset the flag when there's no payment status
      paymentRedirectHandled.current = false;
    }
  }, [searchParams, router]);

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

    if (parseFloat(amount) < 5) {
      toast.error("الحد الأدنى للمبلغ هو 5 جنيه");
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

      {/* Add Balance Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            + إضافة رصيد عبر الدفع الإلكتروني
          </CardTitle>
          <CardDescription>
            اختر طريقة الدفع وأدخل المبلغ لإضافة رصيد إلى حسابك
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Amount Input */}
          <div>
            <Input
              type="number"
              placeholder="أدخل المبلغ (الحد الأدنى : 5 جنيه)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              step="0.01"
              className="w-full"
            />
          </div>

          {/* Payment Method Selection */}
          <div>
            <p className="text-sm font-medium mb-3">اختر طريقة الدفع</p>
            {isLoadingMethods ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(() => {
                  const { mobileWallets, fawry, cards } = getPaymentMethodsByCategory();
                  
                  return (
                    <>
                      {/* Mobile Wallets - Always show */}
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentMethod("mobile_wallets")}
                        className={`p-4 border-2 rounded-lg transition-all hover:shadow-md ${
                          selectedPaymentMethod === "mobile_wallets"
                            ? "border-brand bg-brand/5"
                            : "border-border hover:border-brand/50"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-3 mb-2 min-h-[120px]">
                          {mobileWallets.length > 0 ? (
                            mobileWallets.slice(0, 3).map((method: any, index: number) => {
                              const iconUrl = method.icon;
                              const imageKey = `mobile-${method.id || index}`;
                              const hasFailed = failedImages.has(imageKey);
                              
                              console.log(`Mobile wallet ${index}:`, {
                                name: method.name,
                                icon: iconUrl,
                                id: method.id,
                                originalId: method.originalId,
                                hasFailed
                              });
                              
                              if (!iconUrl || hasFailed) {
                                if (!iconUrl) {
                                  console.warn(`No icon URL for mobile wallet: ${method.name}`);
                                }
                                return (
                                  <div key={index} className="w-[120px] h-[120px] bg-gray-200 rounded flex items-center justify-center">
                                    <Smartphone className="h-12 w-12 text-gray-500" />
                                  </div>
                                );
                              }
                              
                              return (
                                <img
                                  key={index}
                                  src={iconUrl}
                                  alt={method.name || "Payment method"}
                                  className="w-[120px] h-[120px] object-contain"
                                  loading="lazy"
                                  onError={(e) => {
                                    // Try alternative file extensions
                                    const img = e.currentTarget as HTMLImageElement;
                                    if (!img.dataset.retried) {
                                      img.dataset.retried = 'true';
                                      const alternatives = [
                                        iconUrl.replace('.png', '.jpg'),
                                        iconUrl.replace('.png', '.svg'),
                                        iconUrl.replace('pay5.png', 'pay5.jpg'),
                                        iconUrl.replace('pay5.png', 'wallets.png'),
                                      ];
                                      
                                      let tried = 0;
                                      const tryNext = () => {
                                        if (tried < alternatives.length) {
                                          const altUrl = alternatives[tried++];
                                          const testImg = new Image();
                                          testImg.onload = () => {
                                            img.src = altUrl;
                                          };
                                          testImg.onerror = tryNext;
                                          testImg.src = altUrl;
                                        } else {
                                          setFailedImages(prev => new Set(prev).add(imageKey));
                                        }
                                      };
                                      tryNext();
                                    } else {
                                      setFailedImages(prev => new Set(prev).add(imageKey));
                                    }
                                  }}
                                />
                              );
                            })
                          ) : (
                            // Fallback icons - Vodafone, Orange, Etisalat
                            <>
                              <div className="w-[120px] h-[120px] rounded-full bg-red-500 flex items-center justify-center text-white text-lg font-bold">
                                V
                              </div>
                              <div className="w-[120px] h-[120px] rounded bg-orange-500 flex items-center justify-center text-white text-lg font-bold">
                                O
                              </div>
                              <div className="w-[120px] h-[120px] rounded bg-green-500 flex items-center justify-center text-white text-lg font-bold">
                                E
                              </div>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-medium text-center">المحافظ الإلكترونية</p>
                      </button>

                      {/* Fawry - Always show */}
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentMethod("fawry")}
                        className={`p-4 border-2 rounded-lg transition-all hover:shadow-md ${
                          selectedPaymentMethod === "fawry"
                            ? "border-brand bg-brand/5"
                            : "border-border hover:border-brand/50"
                        }`}
                      >
                        <div className="flex items-center justify-center mb-2 min-h-[60px]">
                          {(() => {
                            const fawryMethod = fawry[0];
                            const iconUrl = fawryMethod?.icon;
                            
                            if (!iconUrl) {
                              return (
                                <div className="w-20 h-14 bg-yellow-400 rounded flex items-center justify-center">
                                  <span className="text-blue-600 font-bold text-base">Fawry</span>
                                </div>
                              );
                            }
                            
                            return (
                              <img
                                src={iconUrl}
                                alt={fawryMethod?.name || "Fawry"}
                                className="h-16 object-contain"
                                loading="lazy"
                                onError={(e) => {
                                  // Fallback to icon if image fails to load
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            );
                          })()}
                        </div>
                        <p className="text-sm font-medium text-center">Fawry</p>
                      </button>

                      {/* Credit/Debit Cards - Always show */}
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentMethod("cards")}
                        className={`p-4 border-2 rounded-lg transition-all hover:shadow-md ${
                          selectedPaymentMethod === "cards"
                            ? "border-brand bg-brand/5"
                            : "border-border hover:border-brand/50"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2 mb-2 min-h-[60px]">
                          {cards.length > 0 ? (
                            cards.slice(0, 2).map((method: any, index: number) => {
                              const iconUrl = method.icon;
                              const imageKey = `card-${method.id || index}`;
                              const hasFailed = failedImages.has(imageKey);
                              
                              console.log(`Card ${index}:`, {
                                name: method.name,
                                icon: iconUrl,
                                id: method.id,
                                originalId: method.originalId,
                                hasFailed
                              });
                              
                              if (!iconUrl || hasFailed) {
                                if (!iconUrl) {
                                  console.warn(`No icon URL for card: ${method.name}`);
                                }
                                return (
                                  <div key={index} className="w-16 h-12 bg-gray-200 rounded flex items-center justify-center">
                                    <CreditCard className="h-6 w-6 text-gray-500" />
                                  </div>
                                );
                              }
                              
                              return (
                                <img
                                  key={index}
                                  src={iconUrl}
                                  alt={method.name || "Payment method"}
                                  className="h-12 object-contain"
                                  loading="lazy"
                                  onError={(e) => {
                                    // Try original URL without dot, then lowercase version
                                    const img = e.currentTarget as HTMLImageElement;
                                    if (!img.dataset.retried) {
                                      img.dataset.retried = 'true';
                                      
                                      const alternatives: string[] = [];
                                      
                                      // Try original URL without dot (if different)
                                      if (method.iconOriginal && method.iconOriginal !== iconUrl) {
                                        alternatives.push(method.iconOriginal);
                                      }
                                      
                                      // Try lowercase version
                                      const basePath = iconUrl.substring(0, iconUrl.lastIndexOf('/'));
                                      const fileName = iconUrl.substring(iconUrl.lastIndexOf('/') + 1);
                                      const lowerCaseUrl = `${basePath}/${fileName.toLowerCase()}`;
                                      if (lowerCaseUrl !== iconUrl) {
                                        alternatives.push(lowerCaseUrl);
                                      }
                                      
                                      let tried = 0;
                                      const tryNext = () => {
                                        if (tried < alternatives.length) {
                                          const altUrl = alternatives[tried++];
                                          const testImg = new Image();
                                          testImg.onload = () => {
                                            console.log(`✅ Loaded card image from: ${altUrl}`);
                                            img.src = altUrl;
                                          };
                                          testImg.onerror = () => {
                                            tryNext();
                                          };
                                          testImg.src = altUrl;
                                        } else {
                                          console.error(`❌ Failed to load card image: ${iconUrl}`);
                                          setFailedImages(prev => new Set(prev).add(imageKey));
                                        }
                                      };
                                      
                                      if (alternatives.length > 0) {
                                        tryNext();
                                      } else {
                                        setFailedImages(prev => new Set(prev).add(imageKey));
                                      }
                                    } else {
                                      setFailedImages(prev => new Set(prev).add(imageKey));
                                    }
                                  }}
                                />
                              );
                            })
                          ) : (
                            // Fallback icons - VISA and Meeza
                            <>
                              <div className="w-16 h-12 bg-blue-600 rounded flex items-center justify-center">
                                <span className="text-white font-bold text-sm">VISA</span>
                              </div>
                              <div className="w-16 h-12 bg-purple-600 rounded flex items-center justify-center">
                                <span className="text-white font-bold text-sm">ميزة</span>
                              </div>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-medium text-center">بطاقات الائتمان/الخصم</p>
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Proceed Button */}
          <Button 
            onClick={handleAddBalance}
            disabled={isLoading || !amount || parseFloat(amount) < 1}
            className="w-full bg-brand hover:bg-brand/90"
            size="lg"
          >
            {isLoading ? "جاري التوجيه..." : "الانتقال إلى صفحة الدفع"}
          </Button>
        </CardContent>
      </Card>

      

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
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
                          ? transaction.description.replace(/Added (\d+(?:\.\d+)?) EGP to balance via Fawaterak/, "تم إضافة $1 جنيه إلى الرصيد عبر Fawaterak")
                            .replace(/Added (\d+(?:\.\d+)?) EGP to balance/, "تم إضافة $1 جنيه إلى الرصيد")
                          : transaction.description.includes("Purchased course:") && transaction.type === "PURCHASE"
                          ? transaction.description.replace(/Purchased course: (.+)/, "تم شراء الكورس: $1")
                          : transaction.description
                        }
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(transaction.createdAt)}
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