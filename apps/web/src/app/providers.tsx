import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from 'next-themes'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'

// 应用级 Provider 组装：TanStack Query + 主题 + Tooltip + Toast。
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
