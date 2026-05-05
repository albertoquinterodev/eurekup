import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast !bg-popover !text-popover-foreground !border-glass-border !shadow-elevated backdrop-blur-2xl",
          title: "!text-popover-foreground font-medium",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
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
