export type School = {
  id: string;
  name: string;
  motto: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
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
