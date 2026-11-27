export type School = {
  id: string;
  name: string;
  slug: string | null;
  motto: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  plan: string;
  status: string;
  // Portal primary colour (migration 0010): the colour read from the
  // logo, or the admin's manual pick. Null = default Royal Blue.
  primary_color?: string | null;
  logo_color?: string | null;
  primary_color_source?: "logo" | "manual" | null;
  // Admission form fee (migration 0007): amount in naira + on/off.
  admission_fee_amount?: number | null;
  admission_fee_required?: boolean;
  // Registration phases (migration 0006): each role registers only
  // while its phase is open. All closed by default.
  reg_teacher_open?: boolean;
  reg_student_open?: boolean;
  reg_parent_open?: boolean;
  created_at: string;
};

// ---------------------------------------------------------------- auth / Mother Board
export type Role =
  | "platform_owner"
  | "school_admin"
  | "teacher"
  | "student"
  | "parent";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  school_id: string | null;
  teacher_id: string | null;
  student_id: string | null;
  parent_id: string | null;
  // Registration lifecycle (migration 0006): self-registered accounts
  // start 'Pending' and only get full access once approved ('Active').
  // 'Rejected' carries the reason in status_reason.
  status: string;
  status_reason?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
};

export type SchoolInvite = {
  id: string;
  token: string;
  email: string;
  role: Role;
  school_id: string;
  school_name: string;
  teacher_id: string | null;
  student_id: string | null;
  parent_id: string | null;
  status: string;
  created_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
};

export type Branch = {
  id: string;
  school_id: string;
  name: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  is_main: boolean;
};

export type Term = {
  id: string;
  school_id: string;
  session: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

export type ClassRow = {
  id: string;
  school_id: string;
  branch_id: string | null;
  name: string;
  stage: string;
  arm: string | null;
  capacity: number | null;
  class_teacher_id: string | null;
};

export type Subject = {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
};

export type ClassSubject = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
};

export type Teacher = {
  id: string;
  school_id: string;
  branch_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  // Senior staff (migration 0006): the admin grants this teacher the
  // right to approve parent registrations.
  can_approve_parents?: boolean;
};

// A class (and optional subject) a teacher picked themself at
// registration, or changed later (migration 0011). A pick counts as
// teaching that class - and that subject, when one is picked.
export type TeacherClassPick = {
  id: string;
  school_id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string | null;
  created_at: string;
};

export type Student = {
  id: string;
  school_id: string;
  branch_id: string | null;
  class_id: string | null;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  // Guardian phone or email given at class-link registration
  // (migration 0031). Null for pupils from the file upload.
  guardian_contact?: string | null;
  created_at: string;
};

export type Parent = {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
};

export type ParentChild = {
  id: string;
  parent_id: string;
  student_id: string;
  relationship: string | null;
  // Proposed links start 'Pending' (migration 0006) until the admin
  // or the pupil's class teacher approves them.
  status?: string;
};

// ---------------------------------------------------------------- registration + approvals (migration 0006)
export type RegisterRole = "teacher" | "student" | "parent";

export type RegistrationPhases = {
  teacher: boolean;
  student: boolean;
  parent: boolean;
};

export type RegistrationClass = {
  id: string;
  name: string;
  stage: string;
  arm: string | null;
};

// Which subjects are offered in each class (migration 0011) - the
// teacher register page offers these as subject picks.
export type RegistrationClassSubject = {
  class_id: string;
  subject_id: string;
  subject_name: string;
};

// ---------------------------------------------------------------- admissions (migration 0007)
export type AdmissionFeeStatus = "Free" | "Paid" | "Unpaid";

export type AdmissionStatus =
  | "Submitted"
  | "Under review"
  | "Assessment"
  | "Offered"
  | "Rejected"
  | "Waitlisted"
  | "Enrolled";

export type AdmissionApplication = {
  id: string;
  school_id: string;
  reference: string;
  child_first_name: string;
  child_last_name: string;
  class_id: string | null;
  entry_term_id: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  previous_school: string | null;
  notes: string | null;
  source: string;
  status: string;
  assessment_date: string | null;
  assessment_note: string | null;
  decision_note: string | null;
  student_id: string | null;
  fee_status: string;
  fee_amount: number | null;
  fee_reference: string | null;
  fee_channel: string | null;
  created_at: string;
};

export type AdmissionDocumentKind =
  | "Birth certificate"
  | "Previous result"
  | "Passport photo"
  | "Other";

export type AdmissionDocument = {
  id: string;
  school_id: string;
  application_id: string;
  kind: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  review_note: string | null;
  created_at: string;
};

export type AdmissionSettings = {
  school: {
    id: string;
    slug: string;
    name: string;
    motto: string | null;
    logo_url: string | null;
  };
  fee: { required: boolean; amount: number };
  current_term: { id: string; session: string; name: string } | null;
  terms: { id: string; session: string; name: string; is_current: boolean }[];
  classes: RegistrationClass[];
};

export type RegistrationStatus = {
  school: {
    id: string;
    slug: string;
    name: string;
    motto: string | null;
    logo_url: string | null;
  };
  phases: RegistrationPhases;
  classes: RegistrationClass[];
  class_subjects: RegistrationClassSubject[];
};

export type PupilMatch = {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
};

// Per-class registration link (migration 0031): the public lookup
// for /<slug>/register/class/<class-id>. Returns the school branding,
// that ONE class only, and whether student registration is open -
// never the school's other classes.
export type ClassRegistrationLink = {
  school: {
    id: string;
    slug: string;
    name: string;
    motto: string | null;
    logo_url: string | null;
  };
  class: RegistrationClass;
  student_open: boolean;
};

export type NotificationRow = {
  id: string;
  school_id: string;
  recipient_id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

// ---------------------------------------------------------------- student profiles (migration 0009)
export type StudentProfileShare = {
  id: string;
  school_id: string;
  student_id: string;
  term_id: string | null;
  shared_by: string | null;
  summary_text: string;
  shared_at: string;
  created_at: string;
};

// ---------------------------------------------------------------- absence emails (migration 0008)
export type AbsenceEmailRow = {
  id: string;
  school_id: string;
  class_id: string | null;
  student_id: string;
  parent_id: string;
  term_id: string | null;
  record_date: string;
  kind: string; // Absent | Late
  reason: string | null;
  parent_name: string;
  parent_email: string | null;
  pupil_name: string;
  subject: string;
  body: string;
  // 'Queued - no live email provider yet' | 'Unreachable - no email on record' | 'Sent'
  status: string;
  sent_at: string | null;
  provider: string | null;
  created_at: string;
};
