import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/providers";
import Sidebar from "@/components/sidebar";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Avatar IA — Amarillo Search",
  description: "Générateur de vidéos avatar IA",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="fr" className="dark">
      <body className="font-sans antialiased bg-zinc-950 text-white">
        <Providers>
          {session ? (
            <div className="flex h-screen">
              <Sidebar />
              <main className="flex-1 overflow-y-auto p-8">{children}</main>
            </div>
          ) : (
            children
          )}
        </Providers>
      </body>
    </html>
  );
}
