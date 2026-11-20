import StudentProfileContent from "@/components/workspace/student-profile";

/** Plain route - /students/<id>/profile. The school-path twin lives
 *  at src/app/[school]/students/[id]/profile/page.tsx. */
export default function StudentProfilePage() {
  return <StudentProfileContent />;
}
