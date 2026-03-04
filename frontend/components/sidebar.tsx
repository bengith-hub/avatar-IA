"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  Video,
  Images,
  UserCircle,
  Settings,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard GPU", icon: LayoutDashboard },
  { href: "/generate", label: "Générer", icon: Video },
  { href: "/gallery", label: "Galerie", icon: Images },
  { href: "/avatars", label: "Avatars", icon: UserCircle },
  { href: "/settings", label: "Connexions", icon: Settings },
];

const Sidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-950 px-4 py-6">
      <div className="mb-8 px-2">
        <h1 className="text-lg font-bold text-white">Avatar IA</h1>
        <p className="text-xs text-zinc-500">Amarillo Search</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => signOut()}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
        Déconnexion
      </button>
    </aside>
  );
};

export default Sidebar;
