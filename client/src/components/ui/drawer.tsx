import { Dialog as DrawerPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"

// Slide-over sheet (Option A): a panel that slides in from the right edge of
// the viewport without navigating away from the page behind it. The Agents
// dashboard renders the grid behind it and slides a per-agent detail panel in
// on card click; Escape, backdrop press and the close button all dismiss it.
// Focus is trapped inside the sheet while it is open (base-ui Drawer).
function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerPopup({
  className,
  children,
  ...props
}: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        data-slot="drawer-backdrop"
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DrawerPrimitive.Popup
        data-slot="drawer-popup"
        className={cn(
          "fixed top-0 right-0 z-50 flex h-full min-h-screen w-[min(90vw,28rem)] flex-col border-l bg-card text-card-foreground shadow-xl duration-150 outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right",
          className,
        )}
        {...props}
      >
        {children}
      </DrawerPrimitive.Popup>
    </DrawerPrimitive.Portal>
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-heading text-base leading-snug font-medium", className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerPopup,
  DrawerTitle,
  DrawerDescription,
}