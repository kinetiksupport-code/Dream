import { AlertIcon, CheckIcon, CloseIcon } from "./icons";
export function Toast({
  message,
  error = false,
  onClose,
  action,
  announce = true,
}: {
  message: string;
  error?: boolean;
  /** False when a parent aria-live region already announces the message. */
  announce?: boolean;
  onClose?: () => void;
  action?: { label: string; run: () => void };
}) {
  return (
    <div
      className={`toast${error ? " toast-error" : ""}`}
      role={announce ? (error ? "alert" : "status") : undefined}
    >
      {error ? <AlertIcon /> : <CheckIcon />}
      <span>{message}</span>
      {action && (
        <button className="toast-action press" onClick={action.run}>
          {action.label}
        </button>
      )}
      {onClose && (
        <button
          className="icon-button press"
          aria-label="Cerrar aviso"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
