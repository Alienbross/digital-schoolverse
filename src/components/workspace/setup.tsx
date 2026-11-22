"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import { LogoUploadField } from "@/components/school-logo";
import {
  DEFAULT_PRIMARY_COLOR,
  effectivePrimaryColor,
  extractPrimaryColorFromUrl,
  isValidHexColor,
  normalizeHexColor,
  notifyBrandingChanged,
  primaryColorLabel,
} from "@/lib/branding";
import type { School, Term } from "@/lib/types";
import { TraitEditor } from "@/components/workspace/assessments";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

export default function Setup() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const canManage = useCanManage();
  // No profile yet (Supabase not configured / not signed in) means the
  // old pilot behaviour; a signed-in teacher/student/parent is read-only.
  const readOnly = !!profile && !canManage;
  const [school, setSchool] = useState<School | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [name, setName] = useState("");
  const [motto, setMotto] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [session, setSession] = useState("2026/2027");
  const [termName, setTermName] = useState("First Term");
  // Admission form fee (migration 0007).
  const [feeAmount, setFeeAmount] = useState("");
  const [feeRequired, setFeeRequired] = useState(false);
  // Portal colour (migration 0010): manual pick + hex input.
  const [pickedColor, setPickedColor] = useState(DEFAULT_PRIMARY_COLOR);
  const [pickedHex, setPickedHex] = useState(DEFAULT_PRIMARY_COLOR);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const schoolQuery = schoolId
      ? supabase.from("schools").select("*").eq("id", schoolId).single()
      : supabase
          .from("schools")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
    const { data: s } = await schoolQuery;
    if (s) {
      setSchool(s);
      setName(s.name);
      setMotto(s.motto ?? "");
      setEmail(s.email ?? "");
      setPhone(s.phone ?? "");
      setLogoUrl(s.logo_url ?? null);
      setFeeAmount(s.admission_fee_amount != null ? String(s.admission_fee_amount) : "");
      setFeeRequired(!!s.admission_fee_required);
      const current = effectivePrimaryColor(s);
      setPickedColor(current);
      setPickedHex(current);
    }
    let termsQuery = supabase.from("terms").select("*").order("created_at", { ascending: true });
    if (schoolId) termsQuery = termsQuery.eq("school_id", schoolId);
    else if (s) termsQuery = termsQuery.eq("school_id", s.id);
    const { data: t } = await termsQuery;
    setTerms(t ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const saveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMsg("");
    const payload = { name: name.trim(), motto: motto.trim() || null, email: email.trim() || null, phone: phone.trim() || null };
    const { error } = school
      ? await supabase.from("schools").update(payload).eq("id", school.id)
      : await supabase.from("schools").insert(payload);
    setMsg(error ? `Could not save: ${error.message}` : "School profile saved.");
    setBusy(false);
    load();
  };

  const addTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) {
      setMsg("Save the school profile first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("terms").insert({
      school_id: school.id,
      session: session.trim(),
      name: termName.trim(),
      is_current: terms.length === 0,
    });
    setMsg(error ? `Could not add term: ${error.message}` : "Term added.");
    setBusy(false);
    load();
  };

  const setCurrent = async (id: string) => {
    if (!school) return;
    await supabase.from("terms").update({ is_current: false }).eq("school_id", school.id);
    await supabase.from("terms").update({ is_current: true }).eq("id", id);
    load();
  };

  // Registration phases (migration 0006): open teachers, then
  // students, then parents - or all three at once.
  const togglePhase = async (
    role: "teacher" | "student" | "parent",
    open: boolean,
  ) => {
    if (!school) return;
    setBusy(true);
    const { error } = await supabase
      .from("schools")
      .update({ [`reg_${role}_open`]: open })
      .eq("id", school.id);
    setMsg(
      error
        ? `Could not change: ${error.message}`
        : `${role[0].toUpperCase() + role.slice(1)} registration ${open ? "opened" : "closed"}.`,
    );
    setBusy(false);
    load();
  };

  const openAllPhases = async () => {
    if (!school) return;
    setBusy(true);
    const { error } = await supabase
      .from("schools")
      .update({ reg_teacher_open: true, reg_student_open: true, reg_parent_open: true })
      .eq("id", school.id);
    setMsg(error ? `Could not change: ${error.message}` : "All three registration phases opened.");
    setBusy(false);
    load();
  };

  // Admission form fee (migration 0007): amount in naira + on/off.
  const saveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    const amount = Number(feeAmount);
    if (feeRequired && (!Number.isFinite(amount) || amount <= 0)) {
      setMsg("Enter a fee above ₦0, or switch the fee off for free applications.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("schools")
      .update({
        admission_fee_amount: feeRequired ? amount : 0,
        admission_fee_required: feeRequired,
      })
      .eq("id", school.id);
    setMsg(
      error
        ? `Could not save the fee: ${error.message}`
        : feeRequired
          ? `Admission form fee set - ₦${amount.toLocaleString()} per application (test checkout).`
          : "Admission form fee switched off - applications are free.",
    );
    setBusy(false);
    load();
  };

  // Portal colour (migration 0010): the admin's manual pick, the
  // logo colour, or the default Royal Blue.
  const savePickedColor = async () => {
    if (!school) return;
    const color = normalizeHexColor(pickedHex) ?? normalizeHexColor(pickedColor);
    if (!color) {
      setMsg("Pick a valid colour, e.g. #1D4ED8.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("schools")
      .update({ primary_color: color, primary_color_source: "manual" })
      .eq("id", school.id);
    setMsg(
      error
        ? `Could not save the colour: ${error.message}`
        : `Portal colour set to ${color} - it now colours buttons, links and the active menu item.`,
    );
    setBusy(false);
    notifyBrandingChanged();
    load();
  };

  const applyLogoColor = async () => {
    if (!school) return;
    setBusy(true);
    // Logos uploaded before migration 0010 have no logo_color saved,
    // so read the colour from the logo image itself when needed.
    let color = normalizeHexColor(school.logo_color);
    if (!color && logoUrl) {
      color = await extractPrimaryColorFromUrl(logoUrl);
    }
    if (!color) {
      setMsg(
        "No colour could be read from the logo - upload the logo again or pick a colour below.",
      );
      setBusy(false);
      return;
    }
    const { error } = await supabase
      .from("schools")
      .update({ primary_color: color, logo_color: color, primary_color_source: "logo" })
      .eq("id", school.id);
    setMsg(
      error
        ? `Could not save the colour: ${error.message}`
        : `Portal colour set to the logo colour ${color}.`,
    );
    setBusy(false);
    notifyBrandingChanged();
    load();
  };

  const resetDefaultColor = async () => {
    if (!school) return;
    setBusy(true);
    const { error } = await supabase
      .from("schools")
      .update({ primary_color: null, primary_color_source: null })
      .eq("id", school.id);
    setMsg(
      error
        ? `Could not reset the colour: ${error.message}`
        : "Portal colour reset to the default Royal Blue.",
    );
    setBusy(false);
    notifyBrandingChanged();
    load();
  };

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="School Setup" sub="School profile, sessions and terms." />
      {profile && !canManage && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile.role.replace("_", " ")} - read-only view.
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Registration phases</h2>
          <p className="mb-3 text-sm text-slate-500">
            Open registration in order - teachers first, then students, then
            parents - so pupils exist before parents link them. You can also
            open all three at once. A closed phase shows “not open yet” on
            its register page at{" "}
            <span className="font-semibold text-ink">
              /{school?.slug ?? "your-school"}/register
            </span>
            .
          </p>
          {school ? (
            <div className="space-y-2">
              {(["teacher", "student", "parent"] as const).map((role) => {
                const key = `reg_${role}_open` as const;
                const open = !!school[key];
                return (
                  <div key={role} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2 text-sm">
                    <span>
                      <strong className="capitalize">{role}</strong> registration{" "}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${open ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                        {open ? "Open" : "Closed"}
                      </span>
                    </span>
                    <button
                      className="font-semibold text-royal"
                      disabled={busy || readOnly}
                      onClick={() => togglePhase(role, !open)}
                    >
                      {open ? "Close" : "Open"}
                    </button>
                  </div>
                );
              })}
              <button
                className="mt-1 rounded-lg border border-line px-4 py-2 text-sm font-semibold"
                disabled={busy || readOnly}
                onClick={openAllPhases}
              >
                Open all three phases
              </button>
              <p className="text-xs text-slate-400">
                Pending accounts are decided under Registration &amp; Approvals
                in the sidebar.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Save the school profile first.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">School profile</h2>
          {school ? (
            <div className="mb-4">
              <LogoUploadField
                schoolId={school.id}
                schoolName={school.name}
                currentUrl={logoUrl}
                disabled={readOnly}
                onChanged={(url) => {
                  setLogoUrl(url);
                  load();
                }}
              />
            </div>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              Save the school profile first, then you can upload the logo.
            </p>
          )}
          <form onSubmit={saveSchool} className="space-y-3">
            <div><label className={labelCls}>School name</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greenfield Academy" /></div>
            <div><label className={labelCls}>Motto</label><input className={inputCls} value={motto} onChange={(e) => setMotto(e.target.value)} /></div>
            <div><label className={labelCls}>Email</label><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <button className={btnCls} disabled={busy || !isSupabaseConfigured || readOnly}>Save school</button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Portal colour</h2>
          <p className="mb-3 text-sm text-slate-500">
            The portal colour comes from your logo - it is read
            automatically when you upload one. You can also pick your own
            colour here, go back to the logo colour, or reset to the
            default Royal Blue. It colours buttons, links and the active
            menu item across the whole portal, and the browser tab colour.
            The Mother Board always stays Royal Blue.
          </p>
          {school ? (
            <div>
              <p className="mb-3 flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-sm">
                <span
                  className="inline-block h-6 w-6 shrink-0 rounded-full border border-line"
                  style={{ backgroundColor: effectivePrimaryColor(school) }}
                  aria-label={`Current portal colour ${effectivePrimaryColor(school)}`}
                />
                <span>
                  Current: <strong>{effectivePrimaryColor(school)}</strong>{" "}
                  - {primaryColorLabel(school)}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={normalizeHexColor(pickedHex) ?? DEFAULT_PRIMARY_COLOR}
                  onChange={(e) => {
                    setPickedColor(e.target.value);
                    setPickedHex(e.target.value);
                  }}
                  disabled={readOnly}
                  aria-label="Pick a portal colour"
                  className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white"
                />
                <input
                  className={inputCls}
                  value={pickedHex}
                  onChange={(e) => setPickedHex(e.target.value)}
                  placeholder="#1D4ED8"
                  disabled={readOnly}
                  aria-label="Portal colour as a hex code"
                  style={{ maxWidth: 140 }}
                />
                <button
                  type="button"
                  className={btnCls}
                  disabled={busy || readOnly || !isValidHexColor(pickedHex)}
                  onClick={() => void savePickedColor()}
                >
                  Save colour
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  disabled={busy || readOnly || (!school.logo_color && !logoUrl)}
                  onClick={() => void applyLogoColor()}
                >
                  Use logo colour
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  disabled={busy || readOnly}
                  onClick={() => void resetDefaultColor()}
                >
                  Reset to default Royal Blue
                </button>
              </div>
              {!logoUrl && (
                <p className="mt-2 text-xs text-slate-400">
                  No logo uploaded yet - upload one above and its colour is
                  read automatically.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Save the school profile first.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Assessment traits &amp; skills</h2>
          {school ? (
            <TraitEditor schoolId={school.id} readOnly={readOnly} />
          ) : (
            <p className="text-sm text-slate-500">Save the school profile first.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Admission form fee</h2>
          <p className="mb-3 text-sm text-slate-500">
            What applicants pay for the admission form, at{" "}
            <span className="font-semibold text-ink">
              /{school?.slug ?? "your-school"}/admissions/apply
            </span>
            . The checkout there is a test checkout - no real money moves.
          </p>
          {school ? (
            <div>
              <p className="mb-3 rounded-lg bg-mist px-3 py-2 text-sm">
                Current setting:{" "}
                <strong>
                  {school.admission_fee_required && Number(school.admission_fee_amount ?? 0) > 0
                    ? `Fee on - ₦${Number(school.admission_fee_amount).toLocaleString()} per application`
                    : "Fee off - applications are free"}
                </strong>
              </p>
              <form onSubmit={saveFee} className="space-y-3">
                <div>
                  <label className={labelCls}>Fee amount (₦)</label>
                  <input
                    className={inputCls}
                    value={feeAmount}
                    inputMode="numeric"
                    onChange={(e) => setFeeAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    disabled={readOnly || !feeRequired}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={feeRequired}
                    onChange={(e) => setFeeRequired(e.target.checked)}
                    disabled={readOnly}
                  />
                  Charge an admission form fee
                </label>
                <button className={btnCls} disabled={busy || readOnly}>Save fee setting</button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Save the school profile first.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Sessions &amp; terms</h2>
          <form onSubmit={addTerm} className="mb-4 flex gap-2">
            <input className={inputCls} value={session} onChange={(e) => setSession(e.target.value)} placeholder="2026/2027" />
            <input className={inputCls} value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="First Term" />
            <button className={btnCls} disabled={busy || !isSupabaseConfigured || readOnly}>Add</button>
          </form>
          <ul className="space-y-2 text-sm">
            {terms.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                <span>{t.session} - {t.name} {t.is_current && <span className="ml-1 rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Current</span>}</span>
                {!t.is_current && (
                  <button className="font-semibold text-royal" onClick={() => setCurrent(t.id)}>Set current</button>
                )}
              </li>
            ))}
            {terms.length === 0 && <li className="text-slate-400">No terms yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
