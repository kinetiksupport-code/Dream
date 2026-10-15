import { AlertIcon, CheckIcon, CloseIcon } from "./icons";
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
      className={`toast${error ? " toast-error" : ""}`}
      role={error ? "alert" : "status"}
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
