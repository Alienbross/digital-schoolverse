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
};

export type PupilMatch = {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
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
