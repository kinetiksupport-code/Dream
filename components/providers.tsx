"use client";
import {
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
import { assertDreamAvailable, getMaintenanceStatus } from "@/lib/maintenance-client";
import { MaintenanceCheck, MaintenancePage } from "@/components/maintenance-page";
import type { DreamProfile } from "@/lib/types";
type Theme = "light" | "dark" | "system";
type Availability = "checking" | "available" | "maintenance" | "unavailable";
interface Context {
  session: Session | null;
  ready: boolean;
  availability: Availability;
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
  const [availability, setAvailability] = useState<Availability>("checking");
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
  const availabilityRef = useRef<Availability>(availability);
  availabilityRef.current = availability;
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
    let inFlight = false;
    const apply = (next: Availability) => {
      const previous = availabilityRef.current;
      availabilityRef.current = next;
      setAvailability(next);
      if (previous === "maintenance" && next === "available")
        window.setTimeout(() => router.refresh(), 0);
    };
    const check = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const maintenance = await getMaintenanceStatus();
        if (alive) apply(maintenance ? "maintenance" : "available");
      } catch {
        if (alive) apply("unavailable");
      } finally {
        inFlight = false;
      }
    };
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "DREAM_MAINTENANCE") apply("maintenance");
      if (event.data?.type === "DREAM_MAINTENANCE_UNAVAILABLE")
        apply("unavailable");
    };
    void check();
    const timer = window.setInterval(() => void check(), 10_000);
    const onFocus = () => void check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [router]);
  useEffect(() => {
    if (availability === "maintenance" || availability === "unavailable") {
      try {
        getSupabase().auth.stopAutoRefresh();
      } catch {}
      return;
    }
    if (availability !== "available") return;
    let alive = true;
    try {
      const supabase = getSupabase();
      supabase.auth.startAutoRefresh();
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
  }, [availability]);
  const userId = session?.user.id;
  useEffect(() => {
    if (availability === "available" && userId) void refreshProfile();
  }, [availability, userId, refreshProfile]);
  useEffect(() => {
    const expire = () => {
      if (availabilityRef.current !== "available") return;
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
    if (availability !== "available") return;
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
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
  }, [availability]);
  const logout = async () => {
    await assertDreamAvailable();
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    setProfile(null);
    router.replace("/login");
  };
  const content =
    availability === "checking" ? (
      <MaintenanceCheck />
    ) : availability === "maintenance" || availability === "unavailable" ? (
      <MaintenancePage state={availability} />
    ) : (
      children
    );
  return (
    <DreamContext.Provider
      value={{
        session,
        ready,
        availability,
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
      {content}
    </DreamContext.Provider>
  );
}
export function useDream() {
  const ctx = useContext(DreamContext);
  if (!ctx) throw new Error("Dream provider missing");
  return ctx;
}
