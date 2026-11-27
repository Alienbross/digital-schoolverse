"use client";

import { useAuth } from "@/lib/auth";
import SickbaySection from "@/components/workspace/sickbay";

/** Sickbay alerts. Also renders under /<school-slug>/sickbay. */
export default function Sickbay() {
  const { schoolId } = useAuth();
  return <SickbaySection schoolId={schoolId ?? ""} />;
}
