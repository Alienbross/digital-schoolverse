// Teacher profiling for parents (migration 0022).
//
// Parents see a card per teacher: name, subjects taught, classes
// taught and a short bio. The bio itself lives in `teacher_profiles`
// (one row per teacher); subjects and classes are derived from the
// records the school already keeps - class_subjects + subjects for
// subjects, teacher_class_picks + classes (including classes where
// the teacher is class_teacher_id) for classes.

import { supabase } from "@/lib/supabase";

export type TeacherProfileView = {
  teacherId: string;
  name: string;
  email: string | null;
  subjects: string[];
  classes: string[];
  bio: string | null;
};

/** Load every teacher in the school with their bio, subjects taught
 *  and classes taught. Read-only - this function writes nothing. */
export async function fetchTeacherProfiles(
  schoolId: string
): Promise<TeacherProfileView[]> {
  const { data: teachers } = await supabase
    .from("teachers")
    .select("id, first_name, last_name, email")
    .eq("school_id", schoolId)
    .order("last_name");
  const teacherRows = (teachers as
    | { id: string; first_name: string; last_name: string; email: string | null }[]
    | null) ?? [];
  if (teacherRows.length === 0) return [];
  const teacherIds = teacherRows.map((t) => t.id);

  const [biosRes, subjectsRes, classesRes, classSubjectsRes, picksRes] =
    await Promise.all([
      supabase.from("teacher_profiles").select("teacher_id, bio").eq("school_id", schoolId),
      supabase.from("subjects").select("id, name").eq("school_id", schoolId),
      supabase.from("classes").select("id, name, class_teacher_id").eq("school_id", schoolId),
      supabase
        .from("class_subjects")
        .select("class_id, subject_id, teacher_id")
        .in("teacher_id", teacherIds),
      supabase
        .from("teacher_class_picks")
        .select("teacher_id, class_id, subject_id")
        .eq("school_id", schoolId)
        .in("teacher_id", teacherIds),
    ]);

  const bioByTeacher = new Map<string, string | null>(
    ((biosRes.data as { teacher_id: string; bio: string | null }[] | null) ?? []).map(
      (b) => [b.teacher_id, b.bio]
    )
  );
  const subjectNameById = new Map<string, string>(
    ((subjectsRes.data as { id: string; name: string }[] | null) ?? []).map((s) => [
      s.id,
      s.name,
    ])
  );
  const classRows = (classesRes.data as
    | { id: string; name: string; class_teacher_id: string | null }[]
    | null) ?? [];
  const classNameById = new Map<string, string>(classRows.map((c) => [c.id, c.name]));

  const subjectsByTeacher = new Map<string, Set<string>>();
  const classesByTeacher = new Map<string, Set<string>>();
  const addSubject = (teacherId: string, subjectId: string | null) => {
    const name = subjectId ? subjectNameById.get(subjectId) : undefined;
    if (!name) return;
    const set = subjectsByTeacher.get(teacherId) ?? new Set<string>();
    set.add(name);
    subjectsByTeacher.set(teacherId, set);
  };
  const addClass = (teacherId: string, classId: string | null) => {
    const name = classId ? classNameById.get(classId) : undefined;
    if (!name) return;
    const set = classesByTeacher.get(teacherId) ?? new Set<string>();
    set.add(name);
    classesByTeacher.set(teacherId, set);
  };

  for (const cs of (classSubjectsRes.data as
    | { class_id: string; subject_id: string; teacher_id: string | null }[]
    | null) ?? []) {
    if (!cs.teacher_id) continue;
    addSubject(cs.teacher_id, cs.subject_id);
    addClass(cs.teacher_id, cs.class_id);
  }
  for (const pk of (picksRes.data as
    | { teacher_id: string; class_id: string; subject_id: string | null }[]
    | null) ?? []) {
    addSubject(pk.teacher_id, pk.subject_id);
    addClass(pk.teacher_id, pk.class_id);
  }
  // Classes where the teacher is the class teacher.
  for (const c of classRows) {
    if (c.class_teacher_id) addClass(c.class_teacher_id, c.id);
  }

  return teacherRows.map((t) => ({
    teacherId: t.id,
    name: `${t.first_name} ${t.last_name}`,
    email: t.email,
    subjects: [...(subjectsByTeacher.get(t.id) ?? [])].sort(),
    classes: [...(classesByTeacher.get(t.id) ?? [])].sort(),
    bio: bioByTeacher.get(t.id) ?? null,
  }));
}

/** Save a teacher's bio (the teacher themself or the admin - RLS in
 *  migration 0022 enforces that). Creates the row on first save, so
 *  re-saving updates the same row - never duplicates. */
export async function saveTeacherBio(
  teacherId: string,
  bio: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: teacher } = await supabase
    .from("teachers")
    .select("id, school_id")
    .eq("id", teacherId)
    .maybeSingle();
  const row = teacher as { id: string; school_id: string } | null;
  if (!row) return { ok: false, error: "Teacher not found." };
  const { error } = await supabase.from("teacher_profiles").upsert(
    {
      school_id: row.school_id,
      teacher_id: teacherId,
      bio: bio.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "teacher_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
