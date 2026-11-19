"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Profile, Role } from "@/lib/types";
import { fetchSchoolBySlug, type SchoolBySlug } from "@/lib/slug";

export const OWNER_SCHOOL_KEY = "dsv-owner-school-id";
export const PENDING_INVITE_KEY = "dsv-pending-invite";

type AuthState = {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  /** The school this session is scoped to. Null for the platform owner
   *  (sees all schools) or when no school applies. */
  schoolId: string | null;
  isOwner: boolean;
  /** The school a /<slug> path points at (resolved by the shell from
   *  the URL). Null on plain routes. */
  pathSlug: string | null;
  pathSchool: SchoolBySlug | null;
  pathSchoolStatus: "none" | "loading" | "found" | "not-found";
  setPathSlug: (slug: string | null) => void;
  /** For a platform owner viewing a school's workspace: the school they
   *  picked in the header. Persisted in localStorage. */
  ownerSchoolId: string | null;
  setOwnerSchoolId: (id: string | null) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  loading: true,
  user: null,
  profile: null,
  schoolId: null,
  isOwner: false,
  pathSlug: null,
  pathSchool: null,
  pathSchoolStatus: "none",
  setPathSlug: () => {},
  ownerSchoolId: null,
  setOwnerSchoolId: () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownerSchoolId, setOwnerSchoolIdState] = useState<string | null>(null);
  // School resolved from the URL path (/<slug>/…), set by AppShell.
  const [pathSlug, setPathSlugState] = useState<string | null>(null);
  const [pathSchool, setPathSchool] = useState<SchoolBySlug | null>(null);
  const [pathSchoolStatus, setPathSchoolStatus] = useState<
    "none" | "loading" | "found" | "not-found"
  >("none");

  const setPathSlug = useCallback((slug: string | null) => {
    setPathSlugState((prev) => {
      if (prev === slug) return prev;
      setPathSchool(null);
      setPathSchoolStatus(slug ? "loading" : "none");
      return slug;
    });
  }, []);

  // Resolve the path slug to a school (public RPC — works signed out).
  useEffect(() => {
    if (!pathSlug) return;
    if (!isSupabaseConfigured) {
      // No Supabase yet (local dev without keys): pages work
      // unauthenticated, as before — no slug to resolve.
      setPathSchoolStatus("none");
      return;
    }
    let alive = true;
    (async () => {
      const school = await fetchSchoolBySlug(pathSlug);
      if (!alive) return;
      setPathSchool(school);
      setPathSchoolStatus(school ? "found" : "not-found");
    })();
    return () => {
      alive = false;
    };
  }, [pathSlug]);

  useEffect(() => {
    try {
      setOwnerSchoolIdState(localStorage.getItem(OWNER_SCHOOL_KEY));
    } catch {
      /* storage unavailable — owner just picks no school */
    }
  }, []);

  const setOwnerSchoolId = useCallback((id: string | null) => {
    setOwnerSchoolIdState(id);
    try {
      if (id) localStorage.setItem(OWNER_SCHOOL_KEY, id);
      else localStorage.removeItem(OWNER_SCHOOL_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", u.id)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await loadProfile(session?.user ?? null);
  }, [loadProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // No Supabase yet (local dev without keys): pages work
      // unauthenticated, as before.
      setLoading(false);
      return;
    }
    let alive = true;
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!alive) return;
        setUser(session?.user ?? null);
        await loadProfile(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!alive) return;
        setUser(session?.user ?? null);
        await loadProfile(session?.user ?? null);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const isOwner = profile?.role === "platform_owner";
  // School users are scoped to their own school. The platform owner is
  // scoped to the school they picked in the header (or null = all schools).
  // On a /<slug> path, the path's school wins for everyone — the shell
  // guards school users against opening another school's path.
  const schoolId = pathSchool
    ? pathSchool.id
    : (profile?.school_id ?? ownerSchoolId ?? null);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      profile,
      schoolId,
      isOwner,
      pathSlug,
      pathSchool,
      pathSchoolStatus,
      setPathSlug,
      ownerSchoolId,
      setOwnerSchoolId,
      signOut,
      refreshProfile,
    }),
    [
      loading,
      user,
      profile,
      schoolId,
      isOwner,
      pathSlug,
      pathSchool,
      pathSchoolStatus,
      setPathSlug,
      ownerSchoolId,
      setOwnerSchoolId,
      signOut,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** True when the signed-in user may write school data: platform owner or
 *  the school's admin. Teachers, students and parents are read-only. */
export function useCanManage() {
  const { profile } = useAuth();
  return (
    profile?.role === "platform_owner" || profile?.role === "school_admin"
  );
}

export type { Role };
