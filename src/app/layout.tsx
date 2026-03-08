import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/app/globals.css";
import { TRPCReactProvider } from "@/trpc/react";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Campfire",
  description: "Play together. Plan together.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TRPCReactProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </TRPCReactProvider>
      </body>
    </html>
  );
}
