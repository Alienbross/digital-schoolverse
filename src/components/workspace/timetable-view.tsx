"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { WEEKDAYS } from "@/lib/roles";
import { Card } from "@/components/ui";

type Slot = {
  id: string;
  class_id: string;
  day_of_week: number;
  period: number;
  subject_id: string | null;
  teacher_id: string | null;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
};

/** Weekly timetable grid (Mon–Fri) for one or more classes. Read-only:
 *  the timetable itself is set by the school admin. When classIds has
 *  more than one class, each day/period cell lists every class's slot. */
export default function TimetableView({
  schoolId,
  classIds,
  classNames,
  teacherNames,
}: {
  schoolId: string;
  classIds: string[];
  /** class id -> display name. */
  classNames: Record<string, string>;
  /** teacher id -> display name. */
  teacherNames: Record<string, string>;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [subjects, setSubjects] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!schoolId || classIds.length === 0) {
      setSlots([]);
      return;
    }
    (async () => {
      const { data: s } = await supabase
        .from("timetable_slots")
        .select("*")
        .eq("school_id", schoolId)
        .in("class_id", classIds)
        .order("day_of_week")
        .order("period");
      setSlots((s as Slot[] | null) ?? []);
      const { data: subs } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId);
      const map: Record<string, string> = {};
      for (const r of (subs as { id: string; name: string }[] | null) ?? [])
        map[r.id] = r.name;
      setSubjects(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, classIds.join(",")]);

  if (classIds.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          No class assigned yet, so there is no timetable to show.
        </p>
      </Card>
    );
  }

  const periods = [...new Set(slots.map((s) => s.period))].sort((a, b) => a - b);

  return (
    <Card>
      {slots.length === 0 ? (
        <p className="text-sm text-slate-500">
          No timetable slots saved for {classIds.length === 1 ? "this class" : "these classes"} yet — the school admin sets the weekly timetable.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-mist text-left">
                <th className="border border-line px-2 py-2">Period</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="border border-line px-2 py-2">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p}>
                  <td className="border border-line px-2 py-2 font-semibold">
                    {p}
                    <span className="block text-xs font-normal text-slate-500">
                      {slots.find((s) => s.period === p)?.start_time ?? ""}–
                      {slots.find((s) => s.period === p)?.end_time ?? ""}
                    </span>
                  </td>
                  {[1, 2, 3, 4, 5].map((day) => {
                    const cell = slots.filter(
                      (s) => s.period === p && s.day_of_week === day,
                    );
                    return (
                      <td key={day} className="border border-line px-2 py-2 align-top">
                        {cell.length === 0
                          ? "—"
                          : cell.map((s) => (
                              <p key={s.id} className="mb-1">
                                <strong>{s.subject_id ? subjects[s.subject_id] ?? "—" : "—"}</strong>
                                <span className="block text-xs text-slate-500">
                                  {classIds.length > 1 ? `${classNames[s.class_id] ?? ""} · ` : ""}
                                  {s.teacher_id ? `${teacherNames[s.teacher_id] ?? ""}` : ""}
                                  {s.room ? ` · ${s.room}` : ""}
                                </span>
                              </p>
                            ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
