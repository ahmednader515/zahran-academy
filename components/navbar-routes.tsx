"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

export const NavbarRoutes = () => {
    const { data: session } = useSession();

    useEffect(() => {
        if (session?.user) {
            console.log("Session user:", session.user);
            console.log("Student ID:", session.user.studentId);
        }
    }, [session]);

    return (
        <>
            {/* Student name and ID centered */}
            {session?.user && (
                <div className="flex flex-col items-center text-center">
                    <div className="font-semibold text-foreground">
                        {session.user.name}
                    </div>
                    {session.user.studentId && (
                        <div className="text-sm text-muted-foreground">
                            {session.user.studentId}
                        </div>
                    )}
                </div>
            )}
        </>
    )
}