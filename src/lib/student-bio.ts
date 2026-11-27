// Student bio (migration 0023).
//
// A pupil fills in their own bio: club, interest, sport, ambition
// and favourite colour. One row per pupil in `student_bios`, so
// re-saving updates the same row. The class teacher is NOT stored
// here - it is shown from the pupil's class
// (classes.class_teacher_id) and never edited in the bio.

import { supabase } from "@/lib/supabase";

export type StudentBioFields = {
  club: string | null;
  interest: string | null;
  sport: string | null;
  ambition: string | null;
  favourite_colour: string | null;
};

export type StudentBio = {
  bio: StudentBioFields | null;
  studentName: string | null;
  className: string | null;
  /** Class teacher's name, read from the pupil's class - read-only. */
  classTeacherName: string | null;
};

export type ChildBio = {
  studentId: string;
  studentName: string;
  className: string | null;
  classTeacherName: string | null;
  bio: StudentBioFields | null;
};

const EMPTY_BIO: StudentBioFields = {
  club: null,
  interest: null,
  sport: null,
  ambition: null,
  favourite_colour: null,
};

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v : null;
}

/** Look up the class teacher's name for one class id. */
async function classTeacherNameFor(classId: string | null): Promise<string | null> {
  if (!classId) return null;
  const { data: cls } = await supabase
    .from("classes")
    .select("class_teacher_id")
    .eq("id", classId)
    .maybeSingle();
  const teacherId = (cls as { class_teacher_id: string | null } | null)
    ?.class_teacher_id;
  if (!teacherId) return null;
  const { data: teacher } = await supabase
    .from("teachers")
    .select("first_name, last_name")
    .eq("id", teacherId)
    .maybeSingle();
  const t = teacher as { first_name: string; last_name: string } | null;
  return t ? `${t.first_name} ${t.last_name}` : null;
}

/** Load one pupil's bio plus their class and class teacher names.
 *  Read-only - this function writes nothing. */
export async function fetchStudentBio(studentId: string): Promise<StudentBio> {
  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, class_id")
    .eq("id", studentId)
    .maybeSingle();
  const st = student as {
    id: string;
    first_name: string;
    last_name: string;
    class_id: string | null;
  } | null;
  if (!st) {
    return { bio: null, studentName: null, className: null, classTeacherName: null };
  }
  const [{ data: bioRow }, classTeacherName, classRow] = await Promise.all([
    supabase
      .from("student_bios")
      .select("club, interest, sport, ambition, favourite_colour")
      .eq("student_id", studentId)
      .maybeSingle(),
    classTeacherNameFor(st.class_id),
    st.class_id
      ? supabase.from("classes").select("name").eq("id", st.class_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const bio = bioRow as StudentBioFields | null;
  return {
    bio: bio
      ? {
          club: bio.club,
          interest: bio.interest,
          sport: bio.sport,
          ambition: bio.ambition,
          favourite_colour: bio.favourite_colour,
        }
      : null,
    studentName: `${st.first_name} ${st.last_name}`,
    className: (classRow.data as { name: string } | null)?.name ?? null,
    classTeacherName,
  };
}

/** Save a pupil's bio (the pupil themself or the admin - RLS in
 *  migration 0023 enforces that). Creates the row on first save, so
 *  re-saving updates the same row - never duplicates. */
export async function saveStudentBio(
  studentId: string,
  fields: StudentBioFields
): Promise<{ ok: boolean; error?: string }> {
  const { data: student } = await supabase
    .from("students")
    .select("id, school_id")
    .eq("id", studentId)
    .maybeSingle();
  const row = student as { id: string; school_id: string } | null;
  if (!row) return { ok: false, error: "Pupil not found." };
  const { error } = await supabase.from("student_bios").upsert(
    {
      school_id: row.school_id,
      student_id: studentId,
      club: clean(fields.club),
      interest: clean(fields.interest),
      sport: clean(fields.sport),
      ambition: clean(fields.ambition),
      favourite_colour: clean(fields.favourite_colour),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Load the bios of a parent's linked children (Approved links only -
 *  the same rule as the student profile share). Read-only. */
export async function fetchChildBios(parentId: string): Promise<ChildBio[]> {
  const { data: links } = await supabase
    .from("parent_children")
    .select("student_id")
    .eq("parent_id", parentId)
    .eq("status", "Approved");
  const studentIds = ((links as { student_id: string }[] | null) ?? []).map(
    (l) => l.student_id
  );
  if (studentIds.length === 0) return [];
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, class_id")
    .in("id", studentIds)
    .order("last_name");
  const studentRows = (students as
    | { id: string; first_name: string; last_name: string; class_id: string | null }[]
    | null) ?? [];
  const { data: bios } = await supabase
    .from("student_bios")
    .select("student_id, club, interest, sport, ambition, favourite_colour")
    .in("student_id", studentIds);
  const bioByStudent = new Map<string, StudentBioFields>(
    ((bios as (StudentBioFields & { student_id: string })[] | null) ?? []).map(
      (b) => [
        b.student_id,
        {
          club: b.club,
          interest: b.interest,
          sport: b.sport,
          ambition: b.ambition,
          favourite_colour: b.favourite_colour,
        },
      ]
    )
  );
  const { data: classes } = await supabase.from("classes").select("id, name, class_teacher_id");
  const classById = new Map<string, { name: string; class_teacher_id: string | null }>(
    ((classes as { id: string; name: string; class_teacher_id: string | null }[] | null) ?? []).map(
      (c) => [c.id, { name: c.name, class_teacher_id: c.class_teacher_id }]
    )
  );
  const teacherIds = [...new Set(
    studentRows
      .map((s) => (s.class_id ? classById.get(s.class_id)?.class_teacher_id : null))
      .filter((id): id is string => Boolean(id))
  )];
  const teacherNameById = new Map<string, string>();
  if (teacherIds.length > 0) {
    const { data: teachers } = await supabase
      .from("teachers")
      .select("id, first_name, last_name")
      .in("id", teacherIds);
    for (const t of (teachers as
      | { id: string; first_name: string; last_name: string }[]
      | null) ?? []) {
      teacherNameById.set(t.id, `${t.first_name} ${t.last_name}`);
    }
  }
  return studentRows.map((s) => {
    const cls = s.class_id ? classById.get(s.class_id) : undefined;
    return {
      studentId: s.id,
      studentName: `${s.first_name} ${s.last_name}`,
      className: cls?.name ?? null,
      classTeacherName:
        cls?.class_teacher_id
          ? (teacherNameById.get(cls.class_teacher_id) ?? null)
          : null,
      bio: bioByStudent.get(s.id) ?? null,
    };
  });
}

export { EMPTY_BIO };
