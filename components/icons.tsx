import type { ReactNode, SVGProps } from "react";

/**
 * Stroke icons from the Claude Design canvas (1.75 px stroke, 24 px grid).
 * Decorative by default: pair them with visible text or an aria-label.
 */
function Icon({
  size = 22,
  children,
  strokeWidth = 1.75,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const HomeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Icon>
);
export const ChatIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Icon>
);
export const TasksIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 4h16v16H4z" />
    <path d="m8 12 3 3 5-6" />
  </Icon>
);
export const NotesIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5" />
  </Icon>
);
export const ExamsIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 6h16v14H4z" />
    <path d="M4 10h16M8 3v4M16 3v4" />
  </Icon>
);
export const HistoryIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const SettingsIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Icon>
);
export const MoreIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
);
export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const SendIcon = (p: P) => (
  <Icon strokeWidth={2} size={20} {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);
export const BackIcon = (p: P) => (
  <Icon strokeWidth={2} size={24} {...p}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
);
export const ChevronIcon = (p: P) => (
  <Icon strokeWidth={2} size={18} {...p}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
);
export const SearchIcon = (p: P) => (
  <Icon size={20} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon strokeWidth={2.25} size={18} {...p}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
);
export const CameraIcon = (p: P) => (
  <Icon size={20} {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);
export const ClockIcon = (p: P) => (
  <Icon strokeWidth={2} size={18} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const AlertIcon = (p: P) => (
  <Icon strokeWidth={2} size={18} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16v.5" />
  </Icon>
);
export const StopIcon = (p: P) => (
  <Icon size={16} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </Icon>
);
/* Inicio · suggestion chips (same 1.75 px stroke, 24 px grid). */
export const UploadIcon = (p: P) => (
  <Icon size={20} {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
  </Icon>
);
export const PencilIcon = (p: P) => (
  <Icon size={20} {...p}>
    <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);
export const QuizIcon = (p: P) => (
  <Icon size={20} {...p}>
    <path d="m4 6 1.5 1.5L8 5M4 13l1.5 1.5L8 12" />
    <path d="M11 6.5h9M11 13.5h9M11 19.5h9M5 19.5h1" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon size={18} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
