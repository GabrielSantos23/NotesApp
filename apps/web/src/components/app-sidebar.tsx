import { Link } from "@tanstack/react-router";
import {
  HomeIcon,
  FileTextIcon,
  SettingsIcon,
  UserIcon,
  SearchIcon,
  PlusIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface AppSidebarProps {
  children: React.ReactNode;
}

export function AppSidebar({ children, ...props }: AppSidebarProps) {
  return (
    <SidebarProvider>
      <SidebarContentWithHotkeys children={children} {...props} />
    </SidebarProvider>
  );
}

function SidebarContentWithHotkeys({ children, ...props }: AppSidebarProps) {
  return (
    <div className="flex h-screen w-screen">
      <Sidebar variant="inset" {...props}>
        <SidebarContent>
          <div className="flex items-center gap-2 px-2 pt-2">
            <Input placeholder="Search notes..." className="max-w-sm" />
          </div>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/">
                      <span>Home</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/dashboard">
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <span>Notes</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 px-4 py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="cursor-pointer" />
              </TooltipTrigger>
              <TooltipContent
                side="right"
                align="center"
                className=" text-secondary"
              >
                Toggle sidebar{" "}
                <span className="ml-2 text-xs text-secondary ">(Ctrl+B)</span>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </SidebarInset>
    </div>
  );
}

function UserProfileButton() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <SidebarMenuButton disabled>
        <UserIcon />
        <span>Loading...</span>
      </SidebarMenuButton>
    );
  }

  if (!session) {
    return (
      <SidebarMenuButton asChild>
        <Link to="/login">
          <UserIcon />
          <span>Sign In</span>
        </Link>
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton
      onClick={() => {
        authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              navigate({ to: "/" });
            },
          },
        });
      }}
    >
      <UserIcon />
      <span>{session.user.name}</span>
    </SidebarMenuButton>
  );
}
