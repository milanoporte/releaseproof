import { ShieldCheck } from "lucide-react";
import { AccountPanel } from "./AccountPanel";

export function Navbar() { return <header className="border-b border-border"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 lg:px-8"><div className="flex items-center gap-2 font-bold"><span className="rounded-lg bg-accent p-2 text-accent-foreground"><ShieldCheck className="h-5 w-5" /></span>ReleaseProof</div><AccountPanel /></div></header>; }
