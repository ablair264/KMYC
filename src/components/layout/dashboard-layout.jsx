import {
  SidebarInset,
  SidebarProvider,
} from "../ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { Header } from "./header"

export function DashboardLayout({ children }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}