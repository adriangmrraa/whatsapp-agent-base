import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Package,
  ShoppingCart,
  Bot,
  BarChart3,
  Percent,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  disabled?: boolean
}

export const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
    disabled: false,
  },
  {
    label: "Conversations",
    href: "/admin/conversations",
    icon: MessageSquare,
    disabled: false,
  },
  {
    label: "Leads",
    href: "/admin/leads",
    icon: Users,
    disabled: false,
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: Package,
    disabled: false,
  },
  {
    label: "Orders",
    href: "/admin/orders",
    icon: ShoppingCart,
    disabled: false,
  },
  {
    label: "Promotions",
    href: "/admin/promotions",
    icon: Percent,
    disabled: false,
  },
  {
    label: "Agent",
    href: "/admin/agent",
    icon: Bot,
    disabled: false,
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
    disabled: false,
  },
]
