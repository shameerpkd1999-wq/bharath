import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import "leaflet/dist/leaflet.css"
import BottomNav from "@/components/BottomNav"
import { AuthProvider } from "@/context/AuthContext"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "India Travel Planner | AI-Powered Mobile App",
  description: "Experience India like never before. Native mobile PWA travel guide.",
  manifest: "/manifest.ts",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IndiaTravel",
  },
}

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full scroll-smooth" data-scroll-behavior="smooth">
      <body className={`${inter.className} h-full bg-slate-950 text-slate-900 dark:text-slate-55 antialiased flex justify-center items-center overflow-hidden`}>
        <AuthProvider>
          {/* Persistent Global Mobile Shell */}
          <div className="w-full max-w-md h-full min-h-screen md:h-[92vh] md:min-h-[780px] md:max-h-[900px] md:rounded-[36px] md:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] md:border-[8px] md:border-slate-800 bg-slate-50 dark:bg-slate-950 relative flex flex-col overflow-hidden">
            
            {/* Subtle Mobile Notch Simulation for Premium Aesthetic on Desktop */}
            <div className="hidden md:flex absolute top-0 left-1/2 -translate-x-1/2 h-5 w-32 bg-slate-800 rounded-b-xl z-50 justify-center items-center">
              <div className="w-12 h-1 bg-slate-700 rounded-full" />
            </div>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto scrollbar-none flex flex-col relative w-full h-full">
              {children}
            </main>
            
            {/* Sticky Bottom Navigation Bar */}
            <BottomNav />
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
