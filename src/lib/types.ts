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
  status: string;
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
};
