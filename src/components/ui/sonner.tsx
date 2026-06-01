import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      className="toaster group"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast !bg-popover/90 !text-popover-foreground !border-glass-border !shadow-elevated !backdrop-blur-2xl !rounded-2xl",
          title: "!text-popover-foreground !font-semibold !text-sm",
          description: "!text-muted-foreground !text-xs",
          actionButton: "!bg-primary !text-primary-foreground !rounded-full",
          cancelButton: "!bg-muted !text-muted-foreground !rounded-full",
          success: "!text-popover-foreground",
          error: "!text-destructive",
          info: "!text-popover-foreground",
          warning: "!text-warning",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
