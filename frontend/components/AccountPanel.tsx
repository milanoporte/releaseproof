"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, LogOut, RefreshCw, User, Wifi } from "lucide-react";
import { useWallet } from "@/lib/genlayer/wallet";
import { switchToGenLayerNetwork } from "@/lib/genlayer/client";
import { error } from "@/lib/utils/toast";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

export function AccountPanel() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);

  if (!wallet.isConnected) {
    return <Button size="sm" disabled={wallet.isLoading} onClick={() => wallet.connectWallet().catch(() => undefined)}><User className="mr-2 h-4 w-4" />Connect wallet</Button>;
  }

  const switchNetwork = async () => {
    setSwitchingNetwork(true);
    try { await switchToGenLayerNetwork(); } catch (caught) { error("Could not switch network", { description: caught instanceof Error ? caught.message : "Check MetaMask and try again." }); } finally { setSwitchingNetwork(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-2"><span className={`h-2 w-2 rounded-full ${wallet.isOnCorrectNetwork ? "bg-emerald-400" : "bg-amber-400"}`} /><AddressDisplay address={wallet.address} maxLength={12} /><ChevronDown className="h-3.5 w-3.5" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Wallet</DialogTitle><DialogDescription>Use MetaMask on GenLayer Studionet to verify releases with ReleaseProof.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-black/20 p-4"><p className="text-xs text-muted-foreground">Connected wallet</p><div className="mt-2"><AddressDisplay address={wallet.address} maxLength={28} showCopy /></div></div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4"><div className="flex items-center gap-3"><Wifi className="h-5 w-5 text-accent" /><div><p className="text-sm font-medium">GenLayer Studionet</p><p className="text-xs text-muted-foreground">Chain ID 61999</p></div></div>{wallet.isOnCorrectNetwork ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-4 w-4" />Connected</span> : <Button size="sm" onClick={switchNetwork} disabled={switchingNetwork}>Switch network</Button>}</div>
          <div className="grid grid-cols-2 gap-3"><Button variant="outline" onClick={() => wallet.switchWalletAccount().catch(() => undefined)}><RefreshCw className="mr-2 h-4 w-4" />Switch account</Button><Button variant="outline" onClick={() => { wallet.disconnectWallet(); setOpen(false); }}><LogOut className="mr-2 h-4 w-4" />Disconnect</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
