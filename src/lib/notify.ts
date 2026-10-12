import { toast } from "sonner"

/** User notifications, injectable so controllers stay testable. */
export interface Notifier {
  success: (title: string, detail?: string) => void
  info: (title: string, detail?: string) => void
  warning: (title: string, detail?: string) => void
  error: (title: string, detail?: string) => void
}

/** Toasts (sonner). */
export const toastNotifier: Notifier = {
  success: (title, detail) => toast.success(title, { description: detail }),
  info: (title, detail) => toast.info(title, { description: detail }),
  warning: (title, detail) => toast.warning(title, { description: detail }),
  error: (title, detail) => toast.error(title, { description: detail }),
}
