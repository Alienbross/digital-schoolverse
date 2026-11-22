// Admin view of affective & psychomotor assessments (migration
// 0012): the school admin can enter or view ratings for any class.
// Teachers use the same entry form from their own workspace, scoped
// to the classes they teach.
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fetchCurrentTerm } from "@/lib/roles";
import type { ClassRow, Student, Term } from "@/lib/types";
import { Card, ConfigBanner, PageHeader } from "@/components/ui";
import AssessmentEntry from "@/components/workspace/assessments";

export default function AdminAssessments() {
  const { schoolId, loading: authLoading } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [term, setTerm] = useState<Term | null>(null);

  useEffect(() => {
    if (authLoading || !schoolId) return;
    (async () => {
      const { data: c } = await supabase.from("classes").select("*").eq("school_id", schoolId).order("name");
      setClasses((c as ClassRow[] | null) ?? []);
      const { data: s } = await supabase.from("students").select("*").eq("school_id", schoolId).order("last_name");
      setStudents((s as Student[] | null) ?? []);
      setTerm(await fetchCurrentTerm(schoolId));
    })();
  }, [authLoading, schoolId]);

  const pupilsOf = (classId: string) => students.filter((s) => s.class_id === classId);

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title="Assessments"
        sub="Affective and psychomotor ratings, 1 to 5, per pupil per term. Cognitive scores show read-only here - enter them in Scores & Results."
      />
      {classes.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">No classes yet - the school admin creates them first in Classes &amp; Arms.</p>
        </Card>
      ) : (
        <AssessmentEntry
          schoolId={schoolId ?? ""}
          classes={classes}
          pupilsOf={pupilsOf}
          term={term}
        />
      )}
    </div>
  );
}
