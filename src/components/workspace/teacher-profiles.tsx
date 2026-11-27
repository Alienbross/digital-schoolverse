"use client";

import { useEffect, useState } from "react";
import { useAuth, useCanManage } from "@/lib/auth";
import { Card, ConfigBanner, PageHeader, btnCls, inputCls, labelCls } from "@/components/ui";
import {
  fetchTeacherProfiles,
  saveTeacherBio,
  type TeacherProfileView,
} from "@/lib/teacher-profiles";

/** Teacher profiling for parents (migration 0022).
 *
 *  View mode (parents): a card per teacher with name, subjects,
 *  classes taught and bio. Parents only read - they never edit.
 *  Edit mode (teacher / admin): the same list plus a bio textarea
 *  and Save per teacher. A teacher edits only their own bio; the
 *  admin can edit any teacher's bio. */
export default function TeacherProfilesSection({
  schoolId,
  mode,
}: {
  schoolId: string;
  mode: "view" | "edit";
}) {
  const { profile, loading: authLoading } = useAuth();
  const canManage = useCanManage();
  const [teachers, setTeachers] = useState<TeacherProfileView[]>([]);
  const [state, setState] = useState("loading");
  const [bios, setBios] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const myTeacherId = profile?.teacher_id ?? null;
  const isAdmin = canManage;

  useEffect(() => {
    if (authLoading || !schoolId) return;
    (async () => {
      const rows = await fetchTeacherProfiles(schoolId);
      setTeachers(rows);
      setBios(
        Object.fromEntries(rows.map((t) => [t.teacherId, t.bio ?? ""]))
      );
      setState("ready");
    })();
  }, [authLoading, schoolId]);

  const canEdit = (t: TeacherProfileView) =>
    mode === "edit" && (isAdmin || (myTeacherId !== null && myTeacherId === t.teacherId));

  const saveBio = async (t: TeacherProfileView) => {
    setSavingId(t.teacherId);
    setMsg("");
    const res = await saveTeacherBio(t.teacherId, bios[t.teacherId] ?? "");
    if (!res.ok) {
      setMsg(`Could not save: ${res.error ?? "unknown error"}`);
    } else {
      setMsg(`Bio saved for ${t.name}.`);
      setTeachers((prev) =>
        prev.map((x) =>
          x.teacherId === t.teacherId
            ? { ...x, bio: (bios[t.teacherId] ?? "").trim() || null }
            : x
        )
      );
    }
    setSavingId(null);
  };

  if (state === "loading") {
    return (
      <div>
        <ConfigBanner />
        <p className="text-sm text-slate-500">Loading teachers…</p>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title="Teacher profiles"
        sub={
          mode === "edit"
            ? "Meet the teachers - edit your own bio below, or any bio if you are the admin."
            : "Meet the teachers - who teaches your child, what they teach, and a short bio."
        }
      />
      {teachers.length === 0 ? (
        <p className="text-sm text-slate-500">
          No teachers added for this school yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teachers.map((t) => (
            <Card key={t.teacherId}>
              <h2 className="font-semibold">{t.name}</h2>
              {t.email && <p className="text-sm text-slate-500">{t.email}</p>}
              <p className="mt-2 text-sm">
                <strong>Subjects:</strong>{" "}
                {t.subjects.length > 0 ? t.subjects.join(", ") : "Not assigned yet"}
              </p>
              <p className="mt-1 text-sm">
                <strong>Classes:</strong>{" "}
                {t.classes.length > 0 ? t.classes.join(", ") : "Not assigned yet"}
              </p>
              {canEdit(t) ? (
                <div className="mt-3">
                  <label className={labelCls}>Bio</label>
                  <textarea
                    className={inputCls}
                    rows={4}
                    value={bios[t.teacherId] ?? ""}
                    onChange={(e) =>
                      setBios((prev) => ({ ...prev, [t.teacherId]: e.target.value }))
                    }
                    placeholder="A short bio - what you teach, your experience, what you enjoy about teaching."
                  />
                  <button
                    className={`${btnCls} mt-2`}
                    onClick={() => saveBio(t)}
                    disabled={savingId === t.teacherId}
                  >
                    {savingId === t.teacherId ? "Saving…" : "Save bio"}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  {t.bio ? t.bio : "No bio added yet."}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
      {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
    </div>
  );
}
