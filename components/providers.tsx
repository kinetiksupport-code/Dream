"use client";
import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getDreamProfile, errorMessage } from "@/lib/dream-api";
import { ConnectionStatus } from "@/components/connection-status";
import { ObservabilityRoutes } from "@/components/observability";
import { track, resetAnalytics } from "@/lib/observability/analytics";
import type { DreamProfile } from "@/lib/types";
type Theme = "light" | "dark" | "system";
interface Context {
  session: Session | null;
  ready: boolean;
  profile: DreamProfile | null;
  bootError: string;
  serviceReady: boolean;
  refreshProfile: () => Promise<void>;
  setProfile: (p: DreamProfile) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  logout: () => Promise<void>;
}
const DreamContext = createContext<Context | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<DreamProfile | null>(null);
  const [bootError, setBootError] = useState("");
  const [serviceReady, setServiceReady] = useState(true);
  const [theme, setThemeState] = useState<Theme>("system");
  const [themeReady, setThemeReady] = useState(false);
  const profileRequest = useRef<{
    owner: string | undefined;
    promise: Promise<void>;
  } | null>(null);
  const currentUser = useRef(session?.user.id);
  currentUser.current = session?.user.id;
  const refreshProfile = useCallback(async () => {
    const owner = currentUser.current;
    if (profileRequest.current && profileRequest.current.owner === owner)
      return profileRequest.current.promise;
    const request = (async () => {
      setBootError("");
      try {
        const r = await getDreamProfile();
        if (currentUser.current !== owner) return;
        setProfile(r.profile);
        setServiceReady(r.service_ready);
      } catch (e) {
        if (currentUser.current === owner) setBootError(errorMessage(e));
      }
    })().finally(() => {
      if (profileRequest.current?.promise === request)
        profileRequest.current = null;
    });
    profileRequest.current = { owner, promise: request };
    return request;
  }, []);
  useEffect(() => {
    let alive = true;
    try {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data, error }) => {
        if (alive) {
          setSession(data.session);
          setReady(true);
          if (error) setBootError(error.message);
        }
      });
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, next) => {
        if (alive) {
          if (_event === "SIGNED_IN" && next) {
            try {
              if (sessionStorage.getItem("dream-login-pending") === "1") {
                sessionStorage.removeItem("dream-login-pending");
                track("login_completed", { section: "login" });
              }
            } catch {}
          }
          if (_event === "SIGNED_OUT") resetAnalytics();
          if (currentUser.current !== next?.user.id) {
            setProfile(null);
            currentUser.current = next?.user.id;
          }
          setSession(next);
          setReady(true);
          if (!next) setProfile(null);
        }
      });
      return () => {
        alive = false;
        subscription.unsubscribe();
      };
    } catch (e) {
      setBootError(errorMessage(e));
      setReady(true);
    }
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    if (userId) void refreshProfile();
  }, [userId, refreshProfile]);
  useEffect(() => {
    const expire = () => {
      void getSupabase().auth.signOut({ scope: "local" });
      setSession(null);
      setProfile(null);
      router.replace("/login?expired=1");
    };
    window.addEventListener("dream:session-expired", expire);
    return () => window.removeEventListener("dream:session-expired", expire);
  }, [router]);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("dream-theme");
    } catch {}
    if (saved === "light" || saved === "dark" || saved === "system")
      setThemeState(saved);
    setThemeReady(true);
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const actual =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = actual;
      document
        .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        .forEach(
          (meta) => (meta.content = actual === "dark" ? "#0F0F10" : "#F4F1E9"),
        );
    };
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem("dream-theme", theme);
    } catch {}
    return () => media.removeEventListener("change", apply);
  }, [theme, themeReady]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty(
        "--viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const logout = async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    setProfile(null);
    router.replace("/login");
  };
  return (
    <DreamContext.Provider
      value={{
        session,
        ready,
        profile,
        bootError,
        serviceReady,
        refreshProfile,
        setProfile,
        theme,
        setTheme: setThemeState,
        logout,
      }}
    >
      <ObservabilityRoutes />
      <ConnectionStatus />
      <Fragment key={session?.user.id ?? "signed-out"}>{children}</Fragment>
    </DreamContext.Provider>
  );
}
export function useDream() {
  const ctx = useContext(DreamContext);
  if (!ctx) throw new Error("Dream provider missing");
  return ctx;
}
