"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { SchoolLogo } from "@/components/school-logo";
import PasswordInput from "@/components/password-input";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import {
  PENDING_REGISTRATION_KEY,
  fetchRegistrationStatus,
  findPupilByAdmission,
  findPupilsByName,
  registerSelf,
  type PupilInput,
  type RegistrationInput,
} from "@/lib/registration";
import type { PupilMatch, RegisterRole, RegistrationStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth";

const ROLE_LABEL: Record<RegisterRole, string> = {
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

const ROLE_BLURB: Record<RegisterRole, string> = {
  teacher:
    "Teachers register first. Pick the classes you teach below - and the subjects in each class. Your account waits for the school admin to approve it - then you can take registers, enter scores and use the teacher workspace.",
  student:
    "Students register after teachers. If the school already has your record, enter your student ID (or your name as written) and you are straight in - no approval wait. If you are not in the school list yet, register as a new pupil instead.",
  parent:
    "Parents register last, once pupils are in. Add your child or children below - by admission number, or by name and class - and your account waits for the school admin (or senior staff) to approve it.",
};

/** Public self-registration for one role at one school:
 *  /<slug>/register/teacher, /<slug>/register/student,
 *  /<slug>/register/parent. No invite link needed. The account is
 *  created via Supabase Auth with a Pending profile for that school
 *  (migration 0006); approval unlocks the workspace. The exception
 *  is a student who matches a record the admin already uploaded
 *  (migration 0011): that account is Active at once, no approval. */
export default function RegisterForm({
  slug,
  role,
}: {
  slug: string;
  role: RegisterRole;
}) {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "no-supabase">("loading");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [classId, setClassId] = useState("");
  const [pupils, setPupils] = useState<(PupilInput & { label: string })[]>([]);
  const [pupilMode, setPupilMode] = useState<"admission" | "name">("admission");
  const [admissionNo, setAdmissionNo] = useState("");
  const [pupilFirst, setPupilFirst] = useState("");
  const [pupilLast, setPupilLast] = useState("");
  const [pupilClass, setPupilClass] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  // Teacher class picking (migration 0011): classes the teacher
  // teaches, and the subjects they teach in each picked class.
  const [pickedClasses, setPickedClasses] = useState<string[]>([]);
  const [pickedSubjects, setPickedSubjects] = useState<Record<string, string[]>>({});
  // Student lookup (migration 0011): match the pre-uploaded record
  // by student ID, or by name as written; manual = not in the file.
  const [studentMode, setStudentMode] = useState<"id" | "name" | "manual">("id");
  const [studentIdInput, setStudentIdInput] = useState("");
  const [studentFirst, setStudentFirst] = useState("");
  const [studentLast, setStudentLast] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [matchedPupil, setMatchedPupil] = useState<PupilMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const [preVerified, setPreVerified] = useState(false);
  const [admissionNoOut, setAdmissionNoOut] = useState("");

  useEffect(() => {
    (async () => {
      const s = await fetchRegistrationStatus(slug);
      if (!s) {
        // Distinguish "no Supabase configured" (placeholder client)
        // from a real unknown slug.
        const { error } = await supabase.rpc("school_by_slug", { p_slug: slug });
        setState(error ? "no-supabase" : "not-found");
        return;
      }
      setStatus(s);
      setState("ready");
    })();
  }, [slug]);

  const phaseOpen = status?.phases[role] ?? false;

  const subjectsOfClass = (classIdValue: string) =>
    (status?.class_subjects ?? []).filter((cs) => cs.class_id === classIdValue);

  const togglePickedClass = (classIdValue: string) => {
    setPickedClasses((prev) =>
      prev.includes(classIdValue)
        ? prev.filter((c) => c !== classIdValue)
        : [...prev, classIdValue],
    );
  };

  const togglePickedSubject = (classIdValue: string, subjectId: string) => {
    setPickedSubjects((prev) => {
      const current = prev[classIdValue] ?? [];
      const next = current.includes(subjectId)
        ? current.filter((s) => s !== subjectId)
        : [...current, subjectId];
      return { ...prev, [classIdValue]: next };
    });
  };

  const addPupilByAdmission = async () => {
    if (!status || !admissionNo.trim()) return;
    setBusy(true);
    setMsg("");
    const { pupil, error } = await findPupilByAdmission(status.school.id, admissionNo);
    setBusy(false);
    if (error) {
      setMsg(`Could not look up that pupil: ${error}`);
      return;
    }
    if (!pupil) {
      setMsg(
        `No pupil with admission number "${admissionNo.trim()}" in ${status.school.name}. Check the number - it looks like DSV/2026/0001.`,
      );
      return;
    }
    addPupil(pupil, { student_id: pupil.id, relationship });
  };

  const addPupilByName = async () => {
    if (!status || !pupilFirst.trim() || !pupilLast.trim()) return;
    setBusy(true);
    setMsg("");
    const { pupils: found, error } = await findPupilsByName(
      status.school.id,
      pupilFirst,
      pupilLast,
      pupilClass || null,
    );
    setBusy(false);
    if (error) {
      setMsg(`Could not look up that pupil: ${error}`);
      return;
    }
    if (found.length === 0) {
      setMsg(
        `No pupil called "${pupilFirst.trim()} ${pupilLast.trim()}"${pupilClass ? " in that class" : ""} in ${status.school.name}. Check the spelling, or use the admission number.`,
      );
      return;
    }
    if (found.length > 1) {
      setMsg(
        `More than one pupil is called "${pupilFirst.trim()} ${pupilLast.trim()}". Use the admission number to pick the right one.`,
      );
      return;
    }
    const pupil = found[0];
    addPupil(pupil, {
      first_name: pupil.first_name,
      last_name: pupil.last_name,
      class_id: pupil.class_id,
      relationship,
    });
  };

  const addPupil = (pupil: PupilMatch, input: PupilInput) => {
    if (pupils.some((p) => "student_id" in p && "student_id" in input && p.student_id === input.student_id)) {
      setMsg(`${pupil.first_name} ${pupil.last_name} is already added below.`);
      return;
    }
    setPupils((prev) => [
      ...prev,
      {
        ...input,
        label: `${pupil.first_name} ${pupil.last_name}${pupil.class_name ? ` · ${pupil.class_name}` : ""}`,
      },
    ]);
    setAdmissionNo("");
    setPupilFirst("");
    setPupilLast("");
    setMsg(`${pupil.first_name} ${pupil.last_name} added - the school will check this link before approval.`);
  };

  // Student lookup: find the pre-uploaded record and show the name
  // and class from the file, so the student only sets a password.
  const lookupStudentById = async () => {
    if (!status || !studentIdInput.trim()) return;
    setBusy(true);
    setMsg("");
    const { pupil, error } = await findPupilByAdmission(status.school.id, studentIdInput);
    setBusy(false);
    if (error) {
      setMsg(`Could not look up that student ID: ${error}`);
      return;
    }
    if (!pupil) {
      setMsg(
        `No pupil with student ID "${studentIdInput.trim()}" in ${status.school.name}. Check the ID - it looks like DSV/2026/0001 - or register as a new pupil below.`,
      );
      return;
    }
    setMatchedPupil(pupil);
    setFirstName(pupil.first_name);
    setLastName(pupil.last_name);
    setMsg(`Found you: ${pupil.first_name} ${pupil.last_name}${pupil.class_name ? ` · ${pupil.class_name}` : ""}. Check it is you, then set your password below.`);
  };

  const lookupStudentByName = async () => {
    if (!status || !studentFirst.trim() || !studentLast.trim()) return;
    setBusy(true);
    setMsg("");
    const { pupils: found, error } = await findPupilsByName(
      status.school.id,
      studentFirst,
      studentLast,
      studentClass || null,
    );
    setBusy(false);
    if (error) {
      setMsg(`Could not look up that name: ${error}`);
      return;
    }
    if (found.length === 0) {
      setMsg(
        `No pupil called "${studentFirst.trim()} ${studentLast.trim()}"${studentClass ? " in that class" : ""} in ${status.school.name}. Check the spelling exactly as written, or register as a new pupil below.`,
      );
      return;
    }
    if (found.length > 1) {
      setMsg(
        `More than one pupil is called "${studentFirst.trim()} ${studentLast.trim()}". Use your student ID to pick the right one.`,
      );
      return;
    }
    const pupil = found[0];
    setMatchedPupil(pupil);
    setFirstName(pupil.first_name);
    setLastName(pupil.last_name);
    setMsg(`Found you: ${pupil.first_name} ${pupil.last_name}${pupil.class_name ? ` · ${pupil.class_name}` : ""}. Check it is you, then set your password below.`);
  };

  const clearMatchedPupil = () => {
    setMatchedPupil(null);
    setFirstName("");
    setLastName("");
    setStudentIdInput("");
    setStudentFirst("");
    setStudentLast("");
    setMsg("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!status) return;
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setMsg("Enter your first and last name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMsg("Enter a valid email address.");
      return;
    }
    if (role === "student" && studentMode !== "manual" && !matchedPupil) {
      setMsg("Look up your record first - by student ID, or by your name as written.");
      return;
    }
    if (role === "student" && studentMode === "manual" && !classId) {
      setMsg("Choose your class.");
      return;
    }
    if (role === "parent" && pupils.length === 0) {
      setMsg("Add at least one pupil below - by admission number, or by name and class.");
      return;
    }
    if (!user) {
      if (password.length < 8) {
        setMsg("Use at least 8 characters for your password.");
        return;
      }
      if (password !== confirm) {
        setMsg("The two passwords do not match.");
        return;
      }
    }
    setBusy(true);
    setMsg("");

    // Teacher picks: one pick per subject chosen, or one class-only
    // pick when no subject is ticked for that class.
    const classPicks: { class_id: string; subject_id: string | null }[] =
      role === "teacher"
        ? pickedClasses.flatMap((cId) => {
            const subs = pickedSubjects[cId] ?? [];
            return subs.length > 0
              ? subs.map((sId) => ({ class_id: cId, subject_id: sId as string | null }))
              : [{ class_id: cId, subject_id: null as string | null }];
          })
        : [];

    const input: RegistrationInput = {
      schoolId: status.school.id,
      role,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      classId: role === "student" && studentMode === "manual" ? classId : null,
      studentId: role === "student" && matchedPupil ? matchedPupil.id : null,
      classPicks,
      pupils:
        role === "parent"
          ? pupils.map((p) =>
              "student_id" in p
                ? { student_id: p.student_id, relationship: p.relationship }
                : {
                    first_name: p.first_name,
                    last_name: p.last_name,
                    class_id: p.class_id,
                    relationship: p.relationship,
                  },
            )
          : [],
    };

    const finish = (res: { ok: boolean; error?: string; admission_no?: unknown; pre_verified?: unknown; status?: unknown }) => {
      setBusy(false);
      if (!res.ok) {
        setMsg(res.error ?? "Could not complete your registration.");
        return;
      }
      if (typeof res.admission_no === "string") setAdmissionNoOut(res.admission_no);
      setPreVerified(res.pre_verified === true || res.status === "Active");
      setDone(true);
    };

    // Already signed in (e.g. a second registration attempt, or an
    // account created while email confirmation was pending): finish
    // the registration straight away.
    if (user) {
      const res = await registerSelf(input);
      finish(res);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/${slug}/login`,
      },
    });
    if (error) {
      setMsg(`Could not create your account: ${error.message}`);
      setBusy(false);
      return;
    }
    if (!data.session) {
      // Email confirmation is on: account created, no session yet.
      // Save the registration; /login finishes it on first sign-in.
      try {
        localStorage.setItem(
          PENDING_REGISTRATION_KEY,
          JSON.stringify({ ...input, slug }),
        );
      } catch {
        /* ignore */
      }
      setMsg(
        "Account created - check your email and confirm it, then sign in. " +
          "Your registration will finish automatically when you sign in.",
      );
      setBusy(false);
      return;
    }
    const res = await registerSelf(input);
    finish(res);
  };

  if (state === "loading") {
    return <p className="text-sm text-slate-500">Loading {status?.school.name ?? "registration"}…</p>;
  }

  if (state === "no-supabase") {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Registration" sub="Connect Supabase first - see the banner above." />
      </div>
    );
  }

  if (state === "not-found" || !status) {
    return (
      <div>
        <PageHeader title="School not found" sub="There is no school at this address on Digital SchoolVerse." />
        <p className="text-sm text-slate-500">
          Check the link, or ask the platform owner for the school&apos;s correct address.
        </p>
      </div>
    );
  }

  const school = status.school;

  if (done) {
    return (
      <div>
        <PageHeader title="Registration received" sub={`${school.name} will review your ${ROLE_LABEL[role].toLowerCase()} registration.`} />
        <div className="mb-4 flex items-center gap-3">
          <SchoolLogo name={school.name} logoUrl={school.logo_url} size={56} />
          <div>
            <p className="font-bold text-ink">{school.name}</p>
            {school.motto && <p className="text-sm italic text-slate-500">{school.motto}</p>}
          </div>
        </div>
        <Card>
          {preVerified ? (
            <p className="text-sm text-slate-600">
              <strong>You are in.</strong> Your record was already in the
              school list, so no approval was needed. Sign in to open your
              workspace.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Your account is created and <strong>waiting for approval</strong>.
              {role === "teacher" && " The school admin will approve it."}
              {role === "student" && " Your class teacher or the school admin will approve it."}
              {role === "parent" && " The school admin or senior staff will approve it - and check each pupil link you added."}
            </p>
          )}
          {admissionNoOut && (
            <p className="mt-3 rounded-lg bg-mist px-3 py-2 text-sm">
              <strong>Your admission number is {admissionNoOut}.</strong> Keep it safe - your parent will need it to link you.
            </p>
          )}
          {!preVerified && (
            <p className="mt-3 text-sm text-slate-600">
              You can sign in now to complete your profile and setup, but the
              rest of your workspace stays locked until approval.
            </p>
          )}
          <Link href={`/${slug}/login`} className={`${btnCls} mt-4 inline-block`}>
            Sign in →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title={`Register as ${ROLE_LABEL[role]} - ${school.name}`}
        sub={ROLE_BLURB[role]}
      />
      <div className="mb-4 flex items-center gap-3">
        <SchoolLogo name={school.name} logoUrl={school.logo_url} size={56} />
        <div>
          <p className="font-bold text-ink">{school.name}</p>
          {school.motto && <p className="text-sm italic text-slate-500">{school.motto}</p>}
        </div>
      </div>

      {!phaseOpen && (
        <Card>
          <h2 className="font-semibold">Registration is not open yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            {ROLE_LABEL[role]} registration at {school.name} is still closed.
            The school opens registration in order - teachers first, then
            students, then parents.{" "}
            {status.phases.teacher && "Teacher registration is open now. "}
            {status.phases.student && "Student registration is open now. "}
            {status.phases.parent && "Parent registration is open now. "}
            Ask the school admin when {ROLE_LABEL[role].toLowerCase()}{" "}
            registration opens.
          </p>
          <Link href={`/${slug}/register`} className="mt-3 inline-block text-sm font-semibold text-royal">
            ← Choose a different role
          </Link>
        </Card>
      )}

      {phaseOpen && (
        <div className="max-w-lg">
          {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
          <Card>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>First name</label>
                  <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" disabled={!!matchedPupil} />
                </div>
                <div>
                  <label className={labelCls}>Last name</label>
                  <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" disabled={!!matchedPupil} />
                </div>
              </div>
              {matchedPupil && (
                <p className="text-xs text-slate-500">
                  Name taken from your school record ({matchedPupil.first_name} {matchedPupil.last_name}
                  {matchedPupil.class_name ? ` · ${matchedPupil.class_name}` : ""}).{" "}
                  <button type="button" className="font-semibold text-royal" onClick={clearMatchedPupil}>
                    Not you? Start again
                  </button>
                </p>
              )}
              <div>
                <label className={labelCls}>Email</label>
                <input
                  className={inputCls}
                  type="email"
                  value={user?.email ?? email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!!user}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                {user && <p className="mt-1 text-xs text-slate-400">Signed in as {user.email} - this registration uses that email.</p>}
              </div>
              <div>
                <label className={labelCls}>Phone (optional)</label>
                <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </div>

              {role === "teacher" && (
                <div className="rounded-xl border border-line bg-mist p-3">
                  <h3 className="font-semibold">Classes I teach</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Tick each class you teach. Then tick the subjects you
                    teach in that class - or leave the subjects blank to
                    cover the whole class. The admin still approves your
                    account before you can use these classes.
                  </p>
                  {status.classes.length === 0 && (
                    <p className="mt-2 text-sm text-slate-500">No classes yet - the school admin creates classes before teacher registration opens.</p>
                  )}
                  <div className="mt-2 space-y-2">
                    {status.classes.map((c) => {
                      const subs = subjectsOfClass(c.id);
                      const checked = pickedClasses.includes(c.id);
                      return (
                        <div key={c.id} className="rounded-lg bg-white px-3 py-2">
                          <label className="flex items-center gap-2 text-sm font-semibold">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePickedClass(c.id)}
                            />
                            {c.name}
                            {c.arm ? ` · Arm ${c.arm}` : ""}
                          </label>
                          {checked && subs.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2 pl-6">
                              {subs.map((s) => (
                                <label key={s.subject_id} className="flex items-center gap-1 rounded-full border border-line px-2 py-1 text-xs font-semibold text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={(pickedSubjects[c.id] ?? []).includes(s.subject_id)}
                                    onChange={() => togglePickedSubject(c.id, s.subject_id)}
                                  />
                                  {s.subject_name}
                                </label>
                              ))}
                            </div>
                          )}
                          {checked && subs.length === 0 && (
                            <p className="mt-1 pl-6 text-xs text-slate-400">No subjects assigned to this class yet - you will cover the whole class.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {role === "student" && (
                <div className="rounded-xl border border-line bg-mist p-3">
                  <h3 className="font-semibold">Find my school record</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    The school already has most pupils on file. Find your
                    record and you are straight in - no approval wait. If
                    you are not on file, use “Register as a new pupil”.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 font-semibold ${studentMode === "id" ? "bg-royal text-white" : "border border-line bg-white"}`}
                      onClick={() => { setStudentMode("id"); setMatchedPupil(null); }}
                    >
                      By student ID
                    </button>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 font-semibold ${studentMode === "name" ? "bg-royal text-white" : "border border-line bg-white"}`}
                      onClick={() => { setStudentMode("name"); setMatchedPupil(null); }}
                    >
                      By my name
                    </button>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 font-semibold ${studentMode === "manual" ? "bg-royal text-white" : "border border-line bg-white"}`}
                      onClick={() => { setStudentMode("manual"); setMatchedPupil(null); }}
                    >
                      Register as a new pupil
                    </button>
                  </div>
                  {matchedPupil ? (
                    <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm">
                      <p>
                        <strong>{matchedPupil.first_name} {matchedPupil.last_name}</strong>
                        {matchedPupil.class_name ? ` · ${matchedPupil.class_name}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">This is the record from the school file. Set your password below and you are in.</p>
                    </div>
                  ) : studentMode === "id" ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        className={inputCls}
                        value={studentIdInput}
                        onChange={(e) => setStudentIdInput(e.target.value)}
                        placeholder="e.g. DSV/2026/0001"
                      />
                      <button type="button" className={btnCls} onClick={lookupStudentById} disabled={busy || !studentIdInput.trim()}>
                        Look up
                      </button>
                    </div>
                  ) : studentMode === "name" ? (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inputCls} value={studentFirst} onChange={(e) => setStudentFirst(e.target.value)} placeholder="First name as written" />
                        <input className={inputCls} value={studentLast} onChange={(e) => setStudentLast(e.target.value)} placeholder="Last name as written" />
                      </div>
                      <div className="flex gap-2">
                        <select className={inputCls} value={studentClass} onChange={(e) => setStudentClass(e.target.value)}>
                          <option value="">- Class (optional) -</option>
                          {status.classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <button type="button" className={btnCls} onClick={lookupStudentByName} disabled={busy || !studentFirst.trim() || !studentLast.trim()}>
                          Look up
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <label className={labelCls}>My class</label>
                      <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                        <option value="">- Choose your class -</option>
                        {status.classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.arm ? ` · Arm ${c.arm}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        New pupils wait for their class teacher or the school
                        admin to approve them. If the school has a concern,
                        they will ask you to reach out to support.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {role === "parent" && (
                <div className="rounded-xl border border-line bg-mist p-3">
                  <h3 className="font-semibold">My children</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Add each pupil under you. The school checks every link
                    before approval, so a wrong child or wrong class gets
                    caught early.
                  </p>
                  {pupils.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {pupils.map((p, i) => (
                        <li key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5">
                          <span>{p.label}</span>
                          <button
                            type="button"
                            className="font-semibold text-royal"
                            onClick={() => setPupils((prev) => prev.filter((_, j) => j !== i))}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex gap-2 text-sm">
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 font-semibold ${pupilMode === "admission" ? "bg-royal text-white" : "border border-line bg-white"}`}
                      onClick={() => setPupilMode("admission")}
                    >
                      By admission number
                    </button>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 font-semibold ${pupilMode === "name" ? "bg-royal text-white" : "border border-line bg-white"}`}
                      onClick={() => setPupilMode("name")}
                    >
                      By name + class
                    </button>
                  </div>
                  {pupilMode === "admission" ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        className={inputCls}
                        value={admissionNo}
                        onChange={(e) => setAdmissionNo(e.target.value)}
                        placeholder="e.g. DSV/2026/0001"
                      />
                      <button type="button" className={btnCls} onClick={addPupilByAdmission} disabled={busy || !admissionNo.trim()}>
                        Add pupil
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inputCls} value={pupilFirst} onChange={(e) => setPupilFirst(e.target.value)} placeholder="Pupil's first name" />
                        <input className={inputCls} value={pupilLast} onChange={(e) => setPupilLast(e.target.value)} placeholder="Pupil's last name" />
                      </div>
                      <div className="flex gap-2">
                        <select className={inputCls} value={pupilClass} onChange={(e) => setPupilClass(e.target.value)}>
                          <option value="">- Class (optional) -</option>
                          {status.classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <button type="button" className={btnCls} onClick={addPupilByName} disabled={busy || !pupilFirst.trim() || !pupilLast.trim()}>
                          Add pupil
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2">
                    <label className={labelCls}>I am their…</label>
                    <select className={inputCls} value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                      <option>Parent</option>
                      <option>Father</option>
                      <option>Mother</option>
                      <option>Guardian</option>
                    </select>
                  </div>
                </div>
              )}

              {!user && (
                <>
                  <div>
                    <label className={labelCls}>Choose a password</label>
                    <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
                  </div>
                  <div>
                    <label className={labelCls}>Repeat password</label>
                    <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
                  </div>
                </>
              )}
              <button className={btnCls} disabled={busy || authLoading}>
                Register as {ROLE_LABEL[role].toLowerCase()}
              </button>
              <p className="text-xs text-slate-400">
                {role === "student" && matchedPupil
                  ? "Your record is already in the school list, so your account is active as soon as you register - no approval wait."
                  : "Your account is created as “waiting for approval”. The school reviews it before you get full access."}
              </p>
            </form>
          </Card>
          <p className="mt-4 text-sm text-slate-500">
            Already registered?{" "}
            <Link href={`/${slug}/login`} className="font-semibold text-royal">
              Sign in →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
