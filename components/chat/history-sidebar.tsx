"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHistory } from "@/stores/history";

// Left rail: past conversations for this browser's guest.
export function HistorySidebar({ currentChatId }: { currentChatId: string }) {
  const { chats, loaded, refresh, remove } = useHistory();
  const router = useRouter();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groups = groupByDay(chats);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="flex-row items-center justify-between px-3 py-2">
        <Link className="font-semibold text-sm tracking-tight" href="/">
          rendr
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="icon-sm" variant="ghost">
              <Link aria-label="New chat" href="/">
                <PlusIcon className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>New chat</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <SidebarContent>
        {loaded && chats.length === 0 && (
          <p className="px-4 py-6 text-muted-foreground text-xs">
            Your conversations will appear here.
          </p>
        )}
        {groups.map(([label, items]) => (
          <SidebarGroup key={label}>
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarMenu>
              {items.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={chat.id === currentChatId}
                    tooltip={chat.title}
                  >
                    <Link href={`/chat/${chat.id}`}>
                      <span className="truncate">{chat.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    aria-label={`Delete "${chat.title}"`}
                    onClick={async () => {
                      await remove(chat.id);
                      if (chat.id === currentChatId) {
                        router.push("/");
                      }
                    }}
                    showOnHover
                  >
                    <Trash2Icon />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

function groupByDay(chats: { id: string; title: string; createdAt: number }[]) {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const day = 24 * 60 * 60 * 1000;
  const buckets = new Map<string, typeof chats>();
  for (const chat of chats) {
    const age = startOfToday - chat.createdAt;
    const label =
      age < 0
        ? "Today"
        : age < day
          ? "Yesterday"
          : age < 7 * day
            ? "This week"
            : age < 30 * day
              ? "This month"
              : "Older";
    buckets.set(label, [...(buckets.get(label) ?? []), chat]);
  }
  return Array.from(buckets.entries());
}
