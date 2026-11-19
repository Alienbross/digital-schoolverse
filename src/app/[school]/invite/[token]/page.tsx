"use client";

import { useParams } from "next/navigation";
import AcceptInvite from "@/app/invite/[token]/page";

/** /<school-slug>/invite/<token> - accept a school invite from the
 *  school's own path; after accepting, the person lands in that
 *  school's workspace. */
export default function SchoolInvite() {
  const params = useParams<{ school: string; token: string }>();
  return <AcceptInvite schoolSlug={params.school} />;
}
