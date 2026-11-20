"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import type { ClassRow, School, Student } from "@/lib/types";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

type UploadRow = {
  admission_no: string;
  first_name: string;
  last_name: string;
  class_name: string;
  class_id: string | null;
  gender: string | null;
  date_of_birth: string | null;
  error: string | null;
  skipped: boolean;
};

const TEMPLATE_CSV =
  "admission_no,first_name,last_name,class,gender,date_of_birth\n" +
  "DSV/2026/0001,Emeka,Obi,Primary 3 A,Male,2018-04-12\n" +
  "DSV/2026/0002,Adaeze,Obi,Primary 3 A,Female,2019-01-30\n";

export default function Students() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const base = useWorkspaceBase();
  const canManage = useCanManage();
  const readOnly = !!profile && !canManage;
  const [school, setSchool] = useState<School | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [classId, setClassId] = useState("");
  const [msg, setMsg] = useState("");
  const [year, setYear] = useState(2026);
  // Bulk file upload (migration 0011 flow - no new table: the file
  // creates plain student records, no login yet).
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  const load = async () => {
    const { data: s } = schoolId
      ? await supabase.from("schools").select("*").eq("id", schoolId).single()
      : await supabase.from("schools").select("*").order("created_at").limit(1).single();
    if (!s) return;
    setSchool(s);
    const { data: st } = await supabase.from("students").select("*").eq("school_id", s.id).order("created_at");
    setStudents(st ?? []);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", s.id).order("name");
    setClasses(c ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const nextAdmissionNo = () => {
    return `DSV/${year}/${String(students.length + 1).padStart(4, "0")}`;
  };

  const addStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !firstName.trim() || !lastName.trim()) return;
    const admissionNo = nextAdmissionNo();
    const cls = classes.find((c) => c.id === classId);
    const { error } = await supabase.from("students").insert({
      school_id: school.id,
      branch_id: cls?.branch_id ?? null,
      class_id: classId || null,
      admission_no: admissionNo,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      gender: gender || null,
    });
    setMsg(error ? `Could not add pupil: ${error.message}` : `${firstName.trim()} ${lastName.trim()} added - ${admissionNo}.`);
    setFirstName(""); setLastName(""); setGender("");
    load();
  };

  const classNameOf = (id: string | null) =>
    classes.find((c) => c.id === id)?.name ?? "-";
  const filtered = students.filter((s) =>
    `${s.first_name} ${s.last_name} ${s.admission_no}`.toLowerCase().includes(search.toLowerCase()) &&
    (!classFilter || s.class_id === classFilter) &&
    (!genderFilter || (s.gender ?? "") === genderFilter),
  );

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student-upload-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const normDate = (value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return null;
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${m}-${d}`;
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const asDate = new Date(text);
    if (Number.isNaN(asDate.getTime())) return null;
    return asDate.toISOString().slice(0, 10);
  };

  const handleFile = async (file: File) => {
    setMsg("");
    setUploadRows([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setMsg("That file has no sheet to read.");
        return;
      }
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (raw.length === 0) {
        setMsg("That file has no pupil rows - check the template.");
        return;
      }
      const existingNos = new Set(students.map((s) => s.admission_no.toUpperCase()));
      const seenNos = new Set<string>();
      let seq = students.length + 1;
      const rows: UploadRow[] = raw.map((r) => {
        const pick = (names: string[]) => {
          for (const n of names) {
            for (const key of Object.keys(r)) {
              if (key.trim().toLowerCase() === n) return r[key];
            }
          }
          return "";
        };
        const first = String(pick(["first_name", "firstname", "first name"]) ?? "").trim();
        const last = String(pick(["last_name", "lastname", "last name"]) ?? "").trim();
        const className = String(pick(["class", "class_name", "classname"]) ?? "").trim();
        const genderRaw = String(pick(["gender"]) ?? "").trim();
        const genderNorm =
          genderRaw.toLowerCase().startsWith("f") ? "Female"
          : genderRaw.toLowerCase().startsWith("m") ? "Male"
          : null;
        let admissionNo = String(pick(["admission_no", "admission number", "student_id", "student id"]) ?? "").trim();
        const cls = classes.find((c) => c.name.toLowerCase() === className.toLowerCase()) ?? null;
        let error: string | null = null;
        let skipped = false;
        if (!first || !last) error = "First and last name are required.";
        else if (!cls) error = className ? `No class called "${className}" - create it under Classes & Arms first.` : "Class is required.";
        else if (!normDate(pick(["date_of_birth", "dob", "date of birth"])) && String(pick(["date_of_birth", "dob", "date of birth"]) ?? "").trim() !== "") error = "Date of birth is not a valid date.";
        if (!error) {
          if (!admissionNo) {
            do {
              admissionNo = `DSV/${year}/${String(seq).padStart(4, "0")}`;
              seq += 1;
            } while (existingNos.has(admissionNo.toUpperCase()) || seenNos.has(admissionNo.toUpperCase()));
          }
          if (existingNos.has(admissionNo.toUpperCase())) {
            skipped = true;
            error = `Admission number ${admissionNo} is already on roll - skipped.`;
          } else if (seenNos.has(admissionNo.toUpperCase())) {
            skipped = true;
            error = `Admission number ${admissionNo} appears twice in the file - skipped.`;
          } else {
            seenNos.add(admissionNo.toUpperCase());
          }
        }
        return {
          admission_no: admissionNo,
          first_name: first,
          last_name: last,
          class_name: className,
          class_id: cls?.id ?? null,
          gender: genderNorm,
          date_of_birth: normDate(pick(["date_of_birth", "dob", "date of birth"])),
          error,
          skipped,
        };
      });
      setUploadRows(rows);
    } catch (err) {
      setMsg(`Could not read that file: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  const confirmUpload = async () => {
    if (!school) return;
    const valid = uploadRows.filter((r) => !r.error && !r.skipped);
    if (valid.length === 0) {
      setMsg("Nothing valid to upload - fix the rows above or pick another file.");
      return;
    }
    setUploading(true);
    setMsg("");
    const { error } = await supabase.from("students").insert(
      valid.map((r) => ({
        school_id: school.id,
        class_id: r.class_id,
        admission_no: r.admission_no,
        first_name: r.first_name,
        last_name: r.last_name,
        gender: r.gender,
        date_of_birth: r.date_of_birth,
      })),
    );
    setUploading(false);
    if (error) {
      setMsg(`Upload failed: ${error.message}`);
      return;
    }
    const skippedCount = uploadRows.filter((r) => r.skipped).length;
    const errorCount = uploadRows.filter((r) => r.error && !r.skipped).length;
    setMsg(
      `${valid.length} pupil(s) added from the file.` +
      (skippedCount ? ` ${skippedCount} skipped (already on roll).` : "") +
      (errorCount ? ` ${errorCount} row(s) had errors and were left out.` : "") +
      " Pupils can now register with their student ID - no approval needed.",
    );
    setUploadRows([]);
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Students" sub="Searchable register. Admission numbers are generated automatically - DSV/2026/0001, 0002…" />
      {readOnly && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile?.role.replace("_", " ")} - read-only view.
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">Add a pupil</h2>
            <form onSubmit={addStudent} className="space-y-3">
              <div><label className={labelCls}>First name</label><input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div><label className={labelCls}>Last name</label><input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
              <div><label className={labelCls}>Gender</label>
                <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">-</option><option>Female</option><option>Male</option>
                </select></div>
              <div><label className={labelCls}>Class</label>
                <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">- No class yet -</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <p className="text-xs text-slate-400">Next admission number: {nextAdmissionNo()}</p>
              <button className={btnCls} disabled={!isSupabaseConfigured || readOnly}>Add pupil</button>
            </form>
          </Card>
          {!readOnly && (
            <Card>
              <h2 className="mb-3 font-semibold">Upload pupils from a file</h2>
              <p className="mb-3 text-sm text-slate-500">
                Upload a CSV or Excel file of all pupils, with their student
                IDs, names, class, gender and date of birth. Pupils on the
                file can then register with their student ID and are straight
                in - no approval step. Rows already on roll are skipped.
              </p>
              <button type="button" className="mb-3 text-sm font-semibold text-royal" onClick={downloadTemplate}>
                Download the template (CSV) →
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className={inputCls}
                disabled={!isSupabaseConfigured}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <p className="mt-2 text-xs text-slate-400">
                Columns: admission_no, first_name, last_name, class, gender,
                date_of_birth. Leave admission_no blank to auto-generate one.
              </p>
              {uploadRows.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-sm font-semibold">
                    {uploadRows.filter((r) => !r.error && !r.skipped).length} ready to add ·{" "}
                    {uploadRows.filter((r) => r.skipped).length} skipped ·{" "}
                    {uploadRows.filter((r) => r.error && !r.skipped).length} with errors
                  </p>
                  <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
                    {uploadRows.map((r, i) => (
                      <li key={i} className={`rounded-lg px-3 py-1.5 ${r.error ? "bg-red-50 text-red-700" : "bg-mist"}`}>
                        <strong>{r.first_name} {r.last_name}</strong> · {r.admission_no || "-"} · {r.class_name || "-"}
                        {r.error && <span className="block">{r.error}</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <button className={btnCls} onClick={() => void confirmUpload()} disabled={uploading || uploadRows.filter((r) => !r.error && !r.skipped).length === 0}>
                      {uploading ? "Uploading…" : `Add ${uploadRows.filter((r) => !r.error && !r.skipped).length} pupil(s)`}
                    </button>
                    <button
                      type="button"
                      className="text-sm font-semibold text-royal"
                      onClick={() => { setUploadRows([]); if (fileRef.current) fileRef.current.value = ""; }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
        <div className="md:col-span-2">
          <Card>
            <div className="mb-3 grid gap-2 md:grid-cols-3">
              <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or admission number…" />
              <select className={inputCls} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className={inputCls} value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
                <option value="">All genders</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>
            <ul className="space-y-2 text-sm">
              {filtered.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
                  <span><strong>{s.first_name} {s.last_name}</strong> · {classNameOf(s.class_id)}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Link href={`${base}/students/${s.id}/profile`} className="font-semibold text-royal">Profile →</Link>
                    <Link href={`${base}/students/${s.id}/report-card`} className="font-semibold text-royal">Report card →</Link>
                    <span className="font-mono text-xs text-slate-500">{s.admission_no}</span>
                  </span>
                </li>
              ))}
              {filtered.length === 0 && <li className="text-slate-400">No pupils match these filters.</li>}
            </ul>
            <p className="mt-3 text-xs text-slate-400">{students.length} pupil(s) on roll.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
