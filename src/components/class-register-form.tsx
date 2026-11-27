"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { SchoolLogo } from "@/components/school-logo";
import PasswordInput from "@/components/password-input";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import {
  PENDING_REGISTRATION_KEY,
  fetchClassRegistrationLink,
  registerSelf,
} from "@/lib/registration";
import type { ClassRegistrationLink } from "@/lib/types";
import { useAuth } from "@/lib/auth";

/** Public per-class registration: /<slug>/register/class/<class-id>.
 *  No sign-in needed to open it. A new pupil who is not in the
 *  school's uploaded file enters their name, date of birth, gender
 *  and a guardian contact, and registers straight into that class.
 *  The page only ever shows this one class (migration 0031).
 *  The account is created the same way as the manual path of the
 *  normal student form (migration 0006 / 0011): the pupil waits for
 *  their class teacher or the school admin to approve them. No new
 *  auth path - the pupil sets a password here, exactly as on the
 *  normal student registration page. */
export default function ClassRegisterForm({
  slug,
  classId,
}: {
  slug: string;
  classId: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const [link, setLink] = useState<ClassRegistrationLink | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "no-supabase">("loading");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const [admissionNoOut, setAdmissionNoOut] = useState("");

  useEffect(() => {
    (async () => {
      const l = await fetchClassRegistrationLink(slug, classId);
      if (!l) {
        // Distinguish "no Supabase configured" (placeholder client)
        // from a real unknown slug or class.
        const { error } = await supabase.rpc("school_by_slug", { p_slug: slug });
        setState(error ? "no-supabase" : "not-found");
        return;
      }
      setLink(l);
      setState("ready");
    })();
  }, [slug, classId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link) return;
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setMsg("Enter your first and last name.");
      return;
    }
    if (!dateOfBirth) {
      setMsg("Enter your date of birth.");
      return;
    }
    if (new Date(dateOfBirth).getTime() > Date.now()) {
      setMsg("Date of birth cannot be in the future.");
      return;
    }
    if (gender !== "Male" && gender !== "Female") {
      setMsg("Pick Male or Female for gender.");
      return;
    }
    if (guardianContact.trim().length < 5) {
      setMsg("Enter a guardian contact - a phone number or an email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMsg("Enter a valid email address.");
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

    const finish = (res: { ok: boolean; error?: string; admission_no?: unknown }) => {
      setBusy(false);
      if (!res.ok) {
        setMsg(res.error ?? "Could not complete your registration.");
        return;
      }
      if (typeof res.admission_no === "string") setAdmissionNoOut(res.admission_no);
      setDone(true);
    };

    const input = {
      schoolId: link.school.id,
      role: "student" as const,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: "",
      classId: link.class.id,
      studentId: null,
      classPicks: [],
      dateOfBirth,
      gender,
      guardianContact: guardianContact.trim(),
    };

    // Already signed in: finish the registration straight away.
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
    return <p className="text-sm text-slate-500">Loading registration…</p>;
  }

  if (state === "no-supabase") {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Registration" sub="Connect Supabase first - see the banner above." />
      </div>
    );
  }

  if (state === "not-found" || !link) {
    return (
      <div>
        <PageHeader title="Registration link not found" sub="There is no class at this address on Digital SchoolVerse." />
        <p className="text-sm text-slate-500">
          Check the link - it may have been typed wrong - or ask the school
          for a fresh class registration link.
        </p>
      </div>
    );
  }

  const school = link.school;
  const klass = link.class;

  if (done) {
    return (
      <div>
        <PageHeader title="Registration received" sub={`${school.name} will review your registration for ${klass.name}.`} />
        <div className="mb-4 flex items-center gap-3">
          <SchoolLogo name={school.name} logoUrl={school.logo_url} size={56} />
          <div>
            <p className="font-bold text-ink">{school.name}</p>
            {school.motto && <p className="text-sm italic text-slate-500">{school.motto}</p>}
          </div>
        </div>
        <Card>
          <p className="text-sm text-slate-600">
            Your account is created and <strong>waiting for approval</strong>.
            Your class teacher or the school admin will approve it.
          </p>
          {admissionNoOut && (
            <p className="mt-3 rounded-lg bg-mist px-3 py-2 text-sm">
              <strong>Your admission number is {admissionNoOut}.</strong> Keep it safe - your parent will need it to link you.
            </p>
          )}
          <p className="mt-3 text-sm text-slate-600">
            You can sign in now to complete your profile and setup, but the
            rest of your workspace stays locked until approval.
          </p>
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
        title={`Register for ${klass.name} - ${school.name}`}
        sub={`${klass.stage}${klass.arm ? ` · Arm ${klass.arm}` : ""} - new pupils register here and wait for their class teacher or the school admin to approve them.`}
      />
      <div className="mb-4 flex items-center gap-3">
        <SchoolLogo name={school.name} logoUrl={school.logo_url} size={56} />
        <div>
          <p className="font-bold text-ink">{school.name}</p>
          {school.motto && <p className="text-sm italic text-slate-500">{school.motto}</p>}
        </div>
      </div>

      {!link.student_open && (
        <Card>
          <h2 className="font-semibold">Registration is not open yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Student registration at {school.name} is still closed. The school
            opens registration in order - teachers first, then students, then
            parents. Ask the school admin when student registration opens.
          </p>
          <Link href={`/${slug}/register`} className="mt-3 inline-block text-sm font-semibold text-royal">
            ← Back to registration
          </Link>
        </Card>
      )}

      {link.student_open && (
        <div className="max-w-lg">
          {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
          <Card>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>First name</label>
                  <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
                </div>
                <div>
                  <label className={labelCls}>Last name</label>
                  <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date of birth</label>
                  <input className={inputCls} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                </div>
                <div>
                  <label className={labelCls}>Gender</label>
                  <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">- Pick one -</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Guardian contact</label>
                <input
                  className={inputCls}
                  value={guardianContact}
                  onChange={(e) => setGuardianContact(e.target.value)}
                  placeholder="Parent or guardian phone number or email"
                  autoComplete="tel"
                />
                <p className="mt-1 text-xs text-slate-400">
                  The school uses this to reach your parent or guardian about your registration.
                </p>
              </div>
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
                Register for {klass.name}
              </button>
              <p className="text-xs text-slate-400">
                Your account is created as “waiting for approval”. Your class
                teacher or the school admin reviews it before you get full access.
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
