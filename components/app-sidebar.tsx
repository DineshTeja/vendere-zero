"use client";

import * as React from "react";
import {
  AudioWaveform,
  Command,
  Ratio,
  GalleryVerticalEnd,
  GlobeIcon,
  LibraryBigIcon,
  BarChart3Icon,
  Settings,
  ImageIcon,
} from "lucide-react";
import { LayoutGroup } from "framer-motion";

import { NavMain, type NavItem } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import _ from "lodash";
import { Instrument_Serif } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const instrumentSerif = Instrument_Serif({ weight: "400", subsets: ["latin"] });

// Memoize the data for better performance
const getNavData = () => ({
  teams: [
    {
      name: "Acme Inc",
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: AudioWaveform,
      plan: "Startup",
    },
    {
      name: "Evil Corp.",
      logo: Command,
      plan: "Free",
    },
  ],
  navMain: [
    {
      title: "Market",
      url: "/market",
      icon: BarChart3Icon,
    },
    {
      title: "Library",
      url: "/library",
      icon: LibraryBigIcon,
    },
    {
      title: "Knowledge",
      url: "/query",
      icon: GlobeIcon,
    },
    // {
    //   title: "Ad variants",
    //   url: "/ad-variants",
    //   icon: PlusCircleIcon,
    // },
    {
      title: "Brand Materials",
      url: "/material",
      icon: ImageIcon,
    },
    {
      title: "Automations",
      url: "/automations",
      icon: Settings,
    },
    // {
    //   title: "Simulations",
    //   url: "/simulations",
    //   icon: SquareTerminal
    // },
    // {
    //   title: "Chat",
    //   url: "/chat",
    //   icon: AudioLines
    // },
    // {
    //   title: "Creative",
    //   url: "#",
    //   icon: SquareTerminal,
    //   isActive: true,
    //   items: [
    //     // {
    //     //   title: "Assets",
    //     //   url: "/assets",
    //     // },
    //     {
    //       title: "Evaluate",
    //       url: "/evaluate",
    //     },
    //   ],
    // },
  ],
});

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const data = React.useMemo(() => getNavData(), []);

  // Prefetch the library page to improve navigation performance
  useEffect(() => {
    // Prefetch the library page when the sidebar mounts
    router.prefetch("/library");
  }, [router]);

  // Remove console.log statements for better performance
  const items = React.useMemo(() => {
    return data.navMain.map((item) => ({
      ...item,
      isActive: pathname === item.url,
    })) as NavItem[];
  }, [data.navMain, pathname]);

  // Optimization: capture click events and use router.push for navigation
  const handleNavItemClick = React.useCallback(
    (url: string) => {
      router.push(url);
    },
    [router]
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pb-2">
        <div className="flex items-center gap-2 group-data-[state=collapsed]:pl-1 pt-2 pb-2 transition-all duration-300 ease-in-out">
          <div className="flex items-center justify-center w-8 h-8 transition-all duration-300 ease-in-out">
            <Ratio className="h-6 w-6 bg-[#B1E116] text-black p-1 rounded-md transition-all duration-300 ease-in-out" />
          </div>
          <span
            className={`${instrumentSerif.className} font-light text-2xl text-[#B1E116] whitespace-nowrap overflow-hidden transition-opacity duration-300 ease-in-out group-data-[state=collapsed]:opacity-0`}
          >
            vendere labs
          </span>
        </div>
        <Separator className="mt-2 opacity-50" />
      </SidebarHeader>
      <SidebarContent>
        <LayoutGroup>
          <NavMain items={items} onItemClick={handleNavItemClick} />
        </LayoutGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="mt-auto px-3 py-1 group-data-[state=collapsed]:hidden">
          <div className="inline-flex items-center gap-1.5 rounded-none border border-border/30 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
            <Command className="h-2.5 w-2.5" />
            <span className="font-medium">E to Collapse</span>
          </div>
        </div>
        {user && (
          <NavUser
            user={{
              name: _.startCase(_.toLower(user.email?.split("@")[0] ?? "User")),
              email: user.email ?? "",
              avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${user.email}`,
            }}
          />
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
