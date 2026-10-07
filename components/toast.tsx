import { Check, CircleAlert, X } from "lucide-react";
export function Toast({
  message,
  error = false,
  onClose,
  action,
}: {
  message: string;
  error?: boolean;
  onClose?: () => void;
  action?: { label: string; run: () => void };
}) {
  return (
    <div
      className={`toast ${error ? "toast-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? <CircleAlert size={18} /> : <Check size={18} />}
      <span>{message}</span>
      {action && <button onClick={action.run}>{action.label}</button>}
      {onClose && (
        <button
          className="icon-button"
          aria-label="Cerrar aviso"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
