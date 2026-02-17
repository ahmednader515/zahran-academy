"use client";

import { NavbarRoutes } from "@/components/navbar-routes"
import { MobileSidebar } from "./mobile-sidebar"
import { Logo } from "./logo"
import { LogoutButton } from "./logout-button"

export const Navbar = () => {
    return (
        <div className="p-4 border-b h-full flex items-center justify-between bg-card shadow-sm relative">
            {/* Left side: Sidebar and Logo */}
            <div className="flex items-center">
                <MobileSidebar />
                <div className="hidden md:flex items-center rtl:mr-4 ltr:ml-4">
                    <Logo />
                </div>
            </div>
            
            {/* Center: Student name and ID */}
            <div className="absolute left-1/2 transform -translate-x-1/2">
                <NavbarRoutes />
            </div>
            
            {/* Right side: Logout button */}
            <div className="flex items-center">
                <LogoutButton />
            </div>
        </div>
    )
}