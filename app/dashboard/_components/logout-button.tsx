"use client";

import { useSession, signOut } from "next-auth/react";
import { LoadingButton } from "@/components/ui/loading-button";
import { LogOut } from "lucide-react";
import { useState } from "react";

export const LogoutButton = () => {
    const { data: session } = useSession();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            await signOut({ callbackUrl: "/" });
        } catch (error) {
            console.error("Logout error:", error);
        } finally {
            setIsLoggingOut(false);
        }
    };

    if (!session?.user) {
        return null;
    }

    return (
        <LoadingButton 
            size="sm" 
            variant="ghost" 
            onClick={handleLogout}
            loading={isLoggingOut}
            loadingText="جاري تسجيل الخروج..."
            className="text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors duration-200 ease-in-out text-xs h-8 px-2"
        >
            <LogOut className="h-3 w-3 rtl:ml-1 ltr:mr-1"/>
            <span className="hidden sm:inline">خروج</span>
        </LoadingButton>
    );
};

