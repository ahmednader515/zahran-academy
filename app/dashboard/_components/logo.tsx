import Image from "next/image";

export const Logo = () => {
    return (
        <Image
            height={50}
            width={50}
            alt="logo"
            src="/logo.png"
            unoptimized
            className="object-contain"
        />
    )
}