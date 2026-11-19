"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import {
  fetchNotifications,
  markNotificationsRead,
} from "@/lib/registration";
import type { NotificationRow } from "@/lib/types";

/** In-app notifications bell (migration 0006, in-app only — no email
 *  yet). Shows the unread count for the signed-in user; opening the
 *  list marks everything read. Shown to the school admin and to
 *  teachers — the roles that get notified about registrations and
 *  pupil links. */
export default function NotificationsBell() {
  const { user, profile, loading } = useAuth();
  const base = useWorkspaceBase();
  const [notes, setNotes] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const visible =
    !!user &&
    !!profile &&
    (profile.role === "school_admin" ||
      profile.role === "teacher" ||
      profile.role === "platform_owner");

  const load = async () => {
    const rows = await fetchNotifications();
    setNotes(rows);
    setLoaded(true);
  };

  useEffect(() => {
    if (!visible || loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Refresh the count every minute while the portal is open.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, loading, user?.id]);

  // Keep the unread count live when the auth state changes.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      if (visible) load();
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;
  const unread = notes.filter((n) => !n.is_read).length;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      const ids = notes.filter((n) => !n.is_read).map((n) => n.id);
      if (ids.length > 0) {
        await markNotificationsRead(ids);
        setNotes((prev) => prev.map((n) => ({ ...n, is_read: true })));
      }
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        className="relative rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:border-royal"
      >
        🔔 Notifications
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-royal px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-2xl border border-line bg-white p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <button
              type="button"
              className="text-xs font-semibold text-royal"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          {!loaded ? (
            <p className="px-2 py-3 text-sm text-slate-500">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-500">
              No notifications yet. You will be notified here when someone
              registers or a parent links a pupil.
            </p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    n.is_read ? "bg-white" : "bg-sky-50"
                  }`}
                >
                  <p className="font-semibold text-ink">{n.title}</p>
                  <p className="text-slate-600">{n.body}</p>
                  <p className="mt-1 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {new Date(n.created_at).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {n.link && (
                      <Link
                        href={n.link === "/" ? base || "/" : `${base}${n.link}`}
                        className="font-semibold text-royal"
                        onClick={() => setOpen(false)}
                      >
                        View →
                      </Link>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
