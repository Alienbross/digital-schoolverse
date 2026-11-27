"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import GamesContent from "@/components/workspace/games";

/** /<school-slug>/games - games for pupils, parents and teachers.
 *  The school admin and the platform owner get no Games section;
 *  the page itself says so if they open the link directly. */
export default function Games() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <GamesContent />
    </SchoolWorkspace>
  );
}
