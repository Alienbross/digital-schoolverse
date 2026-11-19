"use client";

import { useParams } from "next/navigation";
import Login from "@/app/login/page";

/** /<school-slug>/login — the school's own sign-in page: its logo
 *  shows, and sign-in lands in that school's workspace. */
export default function SchoolLogin() {
  const params = useParams<{ school: string }>();
  return <Login schoolSlug={params.school} />;
}
