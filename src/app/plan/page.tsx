import { Card, PageHeader } from "@/components/ui";

const BASICS = [
  "Foundation + Admin core — school setup, classes, subjects, students, teachers, parents",
  "Attendance — registers, term % per pupil",
  "Scores & Results — Test /20, Assignment /10, Exam /70, report cards, file upload",
  "Fees & Receipts — term bills, payments, balances, statements",
  "Complaints & Queries — structured intake, CMP tracking, resolve / reopen",
  "Homework & Timetable — per-class homework, weekly grid, copy week",
  "Messages & Announcements — audiences, drafts, two-way threads",
  "Online Admissions — ADM pipeline, enrol to student record",
];

const ADVANCED_LIVE_IN_MUSE = [
  "AI Teacher Assistant — lesson notes, questions, report comments, class summaries",
  "Online fee payment — test checkout (Paystack live keys needed for real money)",
  "CBT & auto-marking — graded / practice, counts into Scores by teacher choice",
  "Advanced analytics — at-risk list, trends, fee collection, complaints",
  "SMS & WhatsApp alerts — test send (live provider needed for real messages)",
  "Parent weekly summaries — per-pupil plain-language weeks",
  "Bus, clinic & discipline — routes, visits, records",
  "Multi-branch & custom report cards — branches, per-branch templates",
  "Online complaint forms — guided 5-step form + status checker",
];

const ADVANCED_TODO = [
  "Admission form fees & document uploads",
  "Live Paystack connection (needs Paystack account + keys)",
  "Live SMS / WhatsApp provider (needs provider choice + account)",
  "Role logins — school admin / teacher / parent / student (Supabase Auth)",
];

export default function Plan() {
  return (
    <div>
      <PageHeader title="Plan & Roadmap" sub="What is live in this pilot build, what is already built in the Muse portal and still to port, and what still needs the user." />
      <div className="space-y-4">
        <Card>
          <h2 className="mb-2 font-semibold text-green-700">✓ Basics — in this pilot build</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {BASICS.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Note: the Basics list above describes the full feature set. This
            pilot ships the Foundation + Admin core first; Attendance, Scores,
            Fees, Complaints, Homework, Messages and Admissions are ported
            next, in that order, from the Muse portal.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-royal">Advanced — built in the Muse portal, to port next</h2>
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
