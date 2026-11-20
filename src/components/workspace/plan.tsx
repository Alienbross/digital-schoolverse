import { Card, PageHeader } from "@/components/ui";

const BASICS = [
  "Foundation + Admin core - school setup, classes, subjects, students, teachers, parents",
  "Attendance - registers, term % per pupil",
  "Scores & Results - Test /20, Assignment /10, Exam /70, report cards, file upload",
  "Fees & Receipts - term bills, payments, balances, statements",
  "Complaints & Queries - structured intake, CMP tracking, resolve / reopen",
  "Homework & Timetable - per-class homework, weekly grid, copy week",
  "Messages & Announcements - audiences, drafts, two-way threads",
  "Online Admissions - ADM pipeline, enrol to student record",
];

const ADVANCED_LIVE_IN_MUSE = [
  "Advanced analytics - at-risk list, trends, fee collection, complaints",
  "SMS & WhatsApp alerts - test send (live provider needed for real messages)",
  "Bus, clinic & discipline - routes, visits, records",
  "Multi-branch & custom report cards - branches, per-branch templates",
];

const ADVANCED_TODO = [
  "Live Paystack connection (needs Paystack account + keys)",
  "Live SMS / WhatsApp provider (needs provider choice + account)",
  "Live email provider for absence emails (Resend or SendGrid - needs provider choice + account; the sendAbsenceEmail plug-in point in src/lib/absence-emails.ts is ready)",
  "Daily teacher-reminder digest email (same live email provider as above; the sendTeacherDigestEmail plug-in point in src/lib/teacher-digest.ts is ready)",
];

const NOW_LIVE = [
  "Mother Board + role logins - Supabase Auth, profiles & invites, auth-based RLS (migration 0002), Light/Dark theme toggle",
  "Online Admissions - public apply form (/<slug>/admissions/apply) with admission form fee test checkout (ADM-PAY-…), document uploads (birth certificate, previous result, passport photo, other - private bucket, 5 MB, PDF/JPG/PNG), admin pipeline Submitted - Under review - Assessment - Offered / Rejected / Waitlisted - Enrolled, fee setting in School Setup (migration 0007)",
  "Teacher workspace (/<slug>/teacher) - Reminders (Today digest + count badge), My Classes, Attendance register, Scores & Results (Test /20, Assignment /10, Exam /70, Nigerian grades, class positions), Lesson Notes, Homework, Timetable, CBT practice-test builder, Messages, Complaints, AI Teacher Assistant (4 drafting tools, drafts only)",
  "Student workspace (/<slug>/student) - My Subjects, Homework, Timetable, My Results + report card, Attendance %, CBT Practice (timed, auto-marked, retakes, never counts as a grade), AI Study Tutor (demo drafts), Help & Complaints with urgent bullying route",
  "Parent workspace (/<slug>/parent) - My Children, per-child attendance / results / homework / timetable, Fees & Receipts with test online checkout, Messages, Complaints 5-step wizard, AI Parent Helper (plain-language progress), Weekly Summaries",
  "Absence emails to parents - when a teacher marks a pupil Absent (or Late, as a milder notice) the parent gets a queued email notice in the portal (migration 0008); no live email provider is connected yet, so notices are labelled Queued - no live email provider yet and parents with no email on record are flagged Unreachable in the log",
  "Teacher reminders - a Reminders tab in the teacher workspace with a Today digest (overdue first, then due today, then due soon): registers not taken, scores not entered, homework and CBT tests coming due, complaints assigned to the teacher still open, weekly summaries not shared yet; a count badge on the tab and an attention strip above the tabs; the admin Overview shows per-teacher task counts (registers due today, subjects with scores still to enter). Read-only - reminders never change a grade, a register or a fee. In-app only; a daily digest email is a plug-in point in src/lib/teacher-digest.ts (needs a live email provider)",
  "Role routing - after sign-in each role lands in its own workspace; scoped write access for the three roles (migration 0005)",
];

export default function Plan() {
  return (
    <div>
      <PageHeader title="Plan & Roadmap" sub="What is live in this pilot build, what is already built in the Muse portal and still to port, and what still needs the user." />
      <div className="space-y-4">
        <Card>
          <h2 className="mb-2 font-semibold text-green-700">✓ Now live in this build</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {NOW_LIVE.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-green-700">✓ Basics - in this pilot build</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {BASICS.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Note: the Basics list above describes the full feature set. The
            Foundation + Admin core is live, and Attendance, Scores, Fees,
            Complaints, Homework, Messages, CBT, weekly summaries and the
            Online Admissions pipeline now live in this build. A dedicated
            admin-side Attendance &amp; Scores overview is still to come.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-royal">Advanced - built in the Muse portal, to port next</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {ADVANCED_LIVE_IN_MUSE.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-amber-700">○ Still needs the user / a decision</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {ADVANCED_TODO.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
