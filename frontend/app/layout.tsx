import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = { title: "ReleaseProof | Software verification by consensus", description: "Verify software releases against natural-language requirements using live evidence and GenLayer consensus." };
export const viewport: Viewport = { themeColor: "#9B6AF6" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><Providers>{children}</Providers></body></html>; }
