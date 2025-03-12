import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
// import { GeistSans } from "geist/font/sans";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
// import { ConditionalSearch } from "@/components/conditional-search";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Vendere Labs",
  description: "Connecting brand and performance in advertising",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const SIDEBAR_STATE_COOKIE = "sidebar:state";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get the session server-side
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const sidebarState = cookieStore.get(SIDEBAR_STATE_COOKIE)?.value === "true";

  return (
    <html lang="en" className="dark">
      <body
        className={`font-sans antialiased dark:bg-background dark:text-white`}
      >
        <Providers>
          <AuthProvider>
            <SidebarProvider defaultOpen={sidebarState}>
              <div className="flex h-screen w-[100%]">
                {session && <AppSidebar />}
                <div className="flex flex-col flex-1 overflow-hidden w-[100%]">
                  <div className="h-16 shrink-0">
                    {session && <Header />}
                  </div>
                  <main className="flex-1 overflow-auto w-[100%] font-sans antialiased">
                    {children}
                  </main>
                  <Toaster />
                </div>
              </div>
            </SidebarProvider>
          </AuthProvider>
        </Providers>
        {/* <ConditionalSearch session={!!session} /> */}
      </body>
    </html>
  );
}
