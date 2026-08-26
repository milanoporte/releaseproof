"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { WalletProvider } from "@/lib/genlayer/WalletProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 2000, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={client}><WalletProvider>{children}</WalletProvider><Toaster position="top-right" theme="dark" richColors closeButton /></QueryClientProvider>;
}
